// ── Cosma AI routes ──────────────────────────────────────────────────────────
//
// Mounted at /cosma/ai/* by server.js. Each endpoint:
//   1. Verifies the caller's Firebase ID token (anonymous auth UIDs ok)
//   2. Applies per-uid rate limits via Upstash Redis
//   3. Pre-filters the prompt for forbidden topics (death, lottery, etc.)
//   4. Calls Gemini Flash with a chart-grounded system prompt
//   5. Post-filters the response and returns JSON the mobile app expects
//
// The mobile app's lib/ai/client.ts treats backend failures as soft — it
// gracefully falls back to local templated readings — so it is safe to ship
// any of these endpoints incrementally.

import { GoogleGenAI } from '@google/genai';
import admin from 'firebase-admin';
import { parseModelReading } from './cosma-parse-reading.js';

// ── Firebase Admin (verify ID tokens from the mobile app) ────────────────────

let firebaseInitDone = false;
function ensureFirebase() {
  if (firebaseInitDone) return;
  firebaseInitDone = true;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!projectId || !clientEmail || !privateKey) {
    console.warn(
      '[cosma-ai] FIREBASE_* env vars missing — Firebase Admin not initialised; /cosma/ai/* will return 401',
    );
    return;
  }
  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    });
    console.log('[cosma-ai] Firebase Admin initialised for project ' + projectId);
  }
}

// ── Gemini client ────────────────────────────────────────────────────────────

let gemini = null;
function ensureGemini() {
  if (gemini) return gemini;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[cosma-ai] GEMINI_API_KEY missing — /cosma/ai/* will return 503');
    return null;
  }
  gemini = new GoogleGenAI({ apiKey });
  console.log('[cosma-ai] Gemini client ready (model=gemini-2.5-flash)');
  return gemini;
}

const MODEL = 'gemini-2.5-flash';

// ── Safety filter ────────────────────────────────────────────────────────────

const FORBIDDEN_PATTERNS = [
  /\b(die|death|dying|dead|kill|killed|murder)\b/i,
  /\b(suicide|self.?harm)\b/i,
  /\b(terminal|incurable|fatal)\b/i,
  /\b(lottery|jackpot|winning numbers|gamble)\b/i,
  /\b(guaranteed|absolutely will|definitely will|certain to)\b/i,
];

function isUnsafePrompt(text) {
  if (!text) return false;
  const t = String(text).toLowerCase();
  if (
    t.includes('when will i die') ||
    t.includes('how will i die') ||
    t.includes('will i get cancer') ||
    t.includes('lottery number')
  ) {
    return true;
  }
  return FORBIDDEN_PATTERNS.some((p) => p.test(text));
}

function sanitize(text) {
  if (!text) return '';
  let out = String(text);
  for (const p of FORBIDDEN_PATTERNS) {
    out = out.replace(new RegExp(p.source, 'gi'), '[reframed]');
  }
  return out;
}

function redirectMessage(language) {
  return language === 'hi'
    ? 'मैं उस सवाल का जवाब नहीं दूँगा। कृपया कुछ और पूछें — करियर, रिश्ते, समय, या आत्म-चिंतन।'
    : 'I will not answer that. Please ask something else — career, relationships, timing, or self-reflection.';
}

// ── Auth middleware ──────────────────────────────────────────────────────────

async function requireCosmaUser(req, res, next) {
  ensureFirebase();
  if (admin.apps.length === 0) {
    return res.status(401).json({ error: 'firebase_admin_not_configured' });
  }
  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!idToken) {
    return res.status(401).json({ error: 'missing_id_token' });
  }
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.cosmaUid = decoded.uid;
    req.cosmaIsAnonymous = decoded.firebase?.sign_in_provider === 'anonymous';
    next();
  } catch (err) {
    console.warn('[cosma-ai] verifyIdToken failed:', err.message || err);
    return res.status(401).json({ error: 'invalid_id_token' });
  }
}

// ── Rate limiter (Upstash Redis) ─────────────────────────────────────────────

function isoWeekKey(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = d.valueOf();
  d.setUTCMonth(0, 1);
  if (d.getUTCDay() !== 4) {
    d.setUTCMonth(0, 1 + ((4 - d.getUTCDay()) + 7) % 7);
  }
  const week = 1 + Math.ceil((firstThursday - d.valueOf()) / 604800000);
  return `${now.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function isoDayKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

async function checkRateLimit(redis, kind, uid, isPremium) {
  let key, limit, ttlSeconds;
  if (kind === 'chat') {
    if (isPremium) {
      key = `cosma:rate:chat:d:${uid}:${isoDayKey()}`;
      limit = 5;
      ttlSeconds = 60 * 60 * 26;
    } else {
      key = `cosma:rate:chat:w:${uid}:${isoWeekKey()}`;
      limit = 1;
      ttlSeconds = 60 * 60 * 24 * 8;
    }
  } else if (kind === 'rashifal') {
    key = `cosma:rate:rashifal:${uid}:${isoDayKey()}`;
    limit = 1;
    ttlSeconds = 60 * 60 * 26;
  } else {
    return { allowed: true };
  }

  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, ttlSeconds);
  if (count > limit) {
    return { allowed: false, retryAfterSeconds: ttlSeconds };
  }
  return { allowed: true, count, limit };
}

// ── System prompts ───────────────────────────────────────────────────────────

const SYSTEM_BASE = `You are a Vedic astrologer with a calm, evidence-based tone. The natal chart you are given is computed with sidereal Lahiri ayanamsa.

Hard rules — non-negotiable:
- No predictions about death, suicide, severe illness, lottery numbers, financial guarantees, or legal absolutes.
- No medical, financial, or legal advice. Always remind the user this is for personal reflection.
- Never speak in absolutes ("always", "never", "definitely will").
- Cite specific planets and houses from the user's chart when relevant (e.g. "your Saturn in your 10th house").
- If the user asks a forbidden topic, gently redirect to career, relationships, timing, or self-reflection.`;

function chatSystemPrompt(language) {
  return `${SYSTEM_BASE}

For chat: 150-280 words. End with either a reflective question OR one concrete small action. Respond in ${language === 'hi' ? 'Hindi (Devanagari script)' : 'English'}.

Output JSON only: { "text": "<full reading as one string, use \\n for paragraphs>", "citations": [{ "planet": "Saturn", "house": 10 }] }`;
}

function rashifalSystemPrompt(language) {
  return `${SYSTEM_BASE}

Generate today's personalized daily rashifal grounded in the user's natal chart AND today's transits for the date given. Respond in ${language === 'hi' ? 'Hindi (Devanagari script)' : 'English'}.

Structure:
- "summary": 2-3 sentences for the home screen (concise hook + one actionable insight).
- "body": 120-160 word overview tying moon sign, current dasha, and today's sky together.
- "sectors": each 70-100 words, cite specific planets/houses from THEIR chart:
  - career: work, reputation, 10th house themes
  - love: relationships, Venus/7th house
  - health: body, routines, 6th house / Moon
  - money: finances, 2nd/11th house
  - family: home, parents, 4th house
- "lucky": color name, number 1-9, direction, avoid window (2-3 hours today)

No absolutes ("always", "never"). Not medical/legal/financial advice.

Output JSON only:
{
  "summary": "...",
  "body": "...",
  "sectors": { "career": "...", "love": "...", "health": "...", "money": "...", "family": "..." },
  "lucky": { "color": "...", "number": 3, "direction": "East", "avoid": "4-6 PM" }
}`;
}

const REPORT_SKU_FOCUS = {
  cosma_report_birthchart: 'Full birth-chart deep-dive — all life domains equally.',
  cosma_report_yearahead: '12-month forecast — transits, dasha periods, month-by-month highlights.',
  cosma_report_career: 'Career report — 10th house, Saturn, Sun, Mercury, dasha for profession and reputation.',
  cosma_report_marriage: 'Marriage timing — 7th house, Venus, Jupiter, Navamsa themes, partnership windows.',
  cosma_report_love: 'Love & relationships — Venus, Moon, 5th and 7th houses, emotional patterns.',
  cosma_report_health: 'Health — 6th house, Moon, Mars, Saturn, routines and vitality cycles.',
  cosma_report_wealth: 'Wealth — 2nd, 11th houses, Jupiter, Venus, income and savings patterns.',
  cosma_report_bundle: 'Comprehensive bundle — cover all domains with extra depth in each section.',
};

function reportSystemPrompt(language, sku) {
  const focus = REPORT_SKU_FOCUS[sku] || 'Personalized Vedic birth-chart report.';
  return `${SYSTEM_BASE}

Generate a paid deep-dive report. Focus: ${focus}
Respond in ${language === 'hi' ? 'Hindi (Devanagari script)' : 'English'}.

Each of the 8 sections must be 200-280 words, cite specific planets/signs/houses from the user's chart, include practical guidance (not vague platitudes). Reference current Mahadasha and Antardasha throughout.

Sections:
- glance: chart headline + dasha snapshot
- sunMoonAsc: Sun, Moon, Ascendant in depth
- planets: all 9 grahas by sign, house, retrograde
- houses: 12 houses with lords and themes
- dasha: Mahadasha + Antardasha meaning and timing
- strengths: yogas and benefic placements
- watchouts: challenging placements and how to work with them
- forecast: 12-month outlook for this report's theme

Output JSON only:
{
  "sections": {
    "glance": "...",
    "sunMoonAsc": "...",
    "planets": "...",
    "houses": "...",
    "dasha": "...",
    "strengths": "...",
    "watchouts": "...",
    "forecast": "..."
  }
}`;
}

// ── Gemini call helper ───────────────────────────────────────────────────────

async function callGemini({ system, user, maxTokens = 600, temperature = 0.7 }) {
  const ai = ensureGemini();
  if (!ai) throw new Error('gemini_not_configured');
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: `${system}\n\n${user}`,
    config: {
      temperature,
      maxOutputTokens: maxTokens,
      responseMimeType: 'application/json',
    },
  });
  const text = response.text ?? '';
  try {
    return JSON.parse(text);
  } catch {
    return parseModelReading(text);
  }
}

// ── Mount ────────────────────────────────────────────────────────────────────

export function mountCosmaAiRoutes(app, { redis }) {
  // Eagerly init so missing env vars show up in startup logs, not first request.
  ensureFirebase();
  ensureGemini();

  // POST /cosma/ai/chat
  //
  // Body: { prompt, chart, language, isPremium? }
  // Returns: { text, citations[] }
  app.post('/cosma/ai/chat', requireCosmaUser, async (req, res) => {
    const { prompt, chart, language = 'en', isPremium = false } = req.body || {};
    if (!prompt || !chart) {
      return res.status(400).json({ error: 'missing_prompt_or_chart' });
    }

    if (isUnsafePrompt(prompt)) {
      return res.json({ text: redirectMessage(language), citations: [], blocked: true });
    }

    const gate = await checkRateLimit(redis, 'chat', req.cosmaUid, isPremium);
    if (!gate.allowed) {
      return res.status(429).json({
        error: 'rate_limited',
        retry_after_seconds: gate.retryAfterSeconds,
      });
    }

    try {
      const userBlock = `User question: ${prompt}\n\nNatal chart JSON:\n${JSON.stringify(chart)}`;
      const out = await callGemini({
        system: chatSystemPrompt(language),
        user: userBlock,
        maxTokens: 2500,
      });
      const parsed = parseModelReading(
        typeof out.text === 'string' ? out.text : '',
        Array.isArray(out.citations) ? out.citations : [],
      );
      return res.json({
        text: sanitize(parsed.text),
        citations: parsed.citations,
      });
    } catch (err) {
      console.error('[cosma-ai] chat error:', err.message || err);
      return res.status(502).json({ error: 'gemini_upstream' });
    }
  });

  // POST /cosma/ai/rashifal
  //
  // Body: { chart, dateISO?, language }
  // Returns: { body, lucky: { color, number, direction, avoid } }
  app.post('/cosma/ai/rashifal', requireCosmaUser, async (req, res) => {
    const { chart, dateISO, language = 'en' } = req.body || {};
    if (!chart) return res.status(400).json({ error: 'missing_chart' });

    const gate = await checkRateLimit(redis, 'rashifal', req.cosmaUid, false);
    if (!gate.allowed) {
      return res.status(429).json({
        error: 'rate_limited',
        retry_after_seconds: gate.retryAfterSeconds,
      });
    }

    try {
      const userBlock = `Date: ${dateISO || new Date().toISOString().slice(0, 10)}\n\nNatal chart JSON:\n${JSON.stringify(chart)}`;
      const out = await callGemini({
        system: rashifalSystemPrompt(language),
        user: userBlock,
        maxTokens: 1800,
      });
      const sectors =
        out.sectors && typeof out.sectors === 'object' ? out.sectors : {};
      return res.json({
        summary: sanitize(out.summary || out.body || ''),
        body: sanitize(out.body || out.summary || ''),
        sectors: {
          career: typeof sectors.career === 'string' ? sanitize(sectors.career) : '',
          love: typeof sectors.love === 'string' ? sanitize(sectors.love) : '',
          health: typeof sectors.health === 'string' ? sanitize(sectors.health) : '',
          money: typeof sectors.money === 'string' ? sanitize(sectors.money) : '',
          family: typeof sectors.family === 'string' ? sanitize(sectors.family) : '',
        },
        lucky: out.lucky ?? null,
      });
    } catch (err) {
      console.error('[cosma-ai] rashifal error:', err.message || err);
      return res.status(502).json({ error: 'gemini_upstream' });
    }
  });

  // POST /cosma/ai/report
  //
  // Body: { chart, sku, language }
  // Returns: { sections: { glance, sunMoonAsc, planets, houses, dasha, strengths, watchouts, forecast } }
  //
  // No server-side rate limit beyond per-sku entitlement check (the mobile
  // app gates this behind the actual paid purchase via RevenueCat).
  app.post('/cosma/ai/report', requireCosmaUser, async (req, res) => {
    const { chart, sku, language = 'en' } = req.body || {};
    if (!chart || !sku) return res.status(400).json({ error: 'missing_chart_or_sku' });

    try {
      const userBlock = `Report SKU: ${sku}\n\nNatal chart JSON:\n${JSON.stringify(chart)}`;
      const out = await callGemini({
        system: reportSystemPrompt(language, sku),
        user: userBlock,
        maxTokens: 8000,
        temperature: 0.6,
      });
      // Sanitize each section's text.
      const sections = out.sections && typeof out.sections === 'object' ? out.sections : {};
      const cleaned = {};
      for (const [k, v] of Object.entries(sections)) {
        cleaned[k] = typeof v === 'string' ? sanitize(v) : v;
      }
      return res.json({ sections: cleaned });
    } catch (err) {
      console.error('[cosma-ai] report error:', err.message || err);
      return res.status(502).json({ error: 'gemini_upstream' });
    }
  });

  console.log('[cosma-ai] routes mounted: POST /cosma/ai/{chat,rashifal,report}');
}
