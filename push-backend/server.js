import cors from 'cors';
import dotenv from 'dotenv';
import { Expo } from 'expo-server-sdk';
import express from 'express';
import { Redis } from '@upstash/redis';

dotenv.config();

const PORT = parseInt(process.env.PORT || '4000', 10);
const TOKENS_KEY     = 'habit_tracker:push_tokens';
const ADMIN_API_KEY  = process.env.ADMIN_API_KEY  || null;
const DEVICE_API_KEY = process.env.DEVICE_API_KEY || null;

/**
 * Vercel automatically injects CRON_SECRET as an env var on every deployment
 * and sends it as "Authorization: Bearer <secret>" on each cron invocation.
 * We read it here so the cron endpoint can validate it without needing the
 * privileged ADMIN_API_KEY.
 */
const CRON_SECRET = process.env.CRON_SECRET || null;

// Schedule is driven by vercel.json cron (30 3 * * * = 03:30 UTC = 09:00 IST).
// These constants are only used for the admin dashboard display.
const DAILY_SUMMARY_UTC_HOUR   = parseInt(process.env.DAILY_SUMMARY_UTC_HOUR   || '3',  10);
const DAILY_SUMMARY_UTC_MINUTE = parseInt(process.env.DAILY_SUMMARY_UTC_MINUTE || '30', 10);

function formatISTFromUTC(utcHour, utcMinute) {
  const ist = (utcHour * 60 + utcMinute + 330) % (24 * 60); // IST = UTC+5:30
  return `${String(Math.floor(ist / 60)).padStart(2, '0')}:${String(ist % 60).padStart(2, '0')} IST`;
}
const DAILY_SUMMARY_IST = formatISTFromUTC(DAILY_SUMMARY_UTC_HOUR, DAILY_SUMMARY_UTC_MINUTE);

/** Extracts the API key from common header locations. */
function extractKey(req) {
  return (
    req.headers['x-admin-key'] ||
    req.headers['x-device-key'] ||
    req.headers['x-api-key'] ||
    (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '')
  );
}

/**
 * Full admin access — required for /status, /send, /api/daily-summary.
 * If ADMIN_API_KEY is not set, all requests pass (local dev fallback).
 */
function requireAdmin(req, res, next) {
  if (!ADMIN_API_KEY) { next(); return; }
  if (extractKey(req) !== ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized — invalid admin key.' });
  }
  next();
}

/**
 * Device-level access — used by mobile app for /register and /unregister.
 * Accepts either the DEVICE_API_KEY or the ADMIN_API_KEY (admin can do everything).
 * If neither key is set, requests pass (local dev fallback).
 */
function requireDevice(req, res, next) {
  if (!ADMIN_API_KEY && !DEVICE_API_KEY) { next(); return; }
  const k = extractKey(req);
  const valid = [ADMIN_API_KEY, DEVICE_API_KEY].filter(Boolean);
  if (!valid.includes(k)) {
    return res.status(401).json({ error: 'Unauthorized — invalid device key.' });
  }
  next();
}

/**
 * Cron-or-admin access — used only for GET /api/daily-summary.
 *
 * Accepts two callers:
 *  1. ADMIN_API_KEY  — manual "Send Daily Summary" trigger from the dashboard
 *  2. CRON_SECRET    — Vercel Cron, which automatically injects its own secret
 *                      as "Authorization: Bearer <CRON_SECRET>" on every run.
 *                      Without this, the cron silently returns 401 in production
 *                      because it never sends ADMIN_API_KEY.
 *
 * Falls through with no keys set (local dev / staging without auth).
 */
function requireCronOrAdmin(req, res, next) {
  if (!ADMIN_API_KEY && !CRON_SECRET) { next(); return; }
  const k = extractKey(req);
  if (ADMIN_API_KEY && k === ADMIN_API_KEY) { next(); return; }
  if (CRON_SECRET   && k === CRON_SECRET)   { next(); return; }
  return res.status(401).json({ error: 'Unauthorized — missing or invalid cron/admin key.' });
}

// ── Clients ───────────────────────────────────────────────────────────────────

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const expo = new Expo({
  accessToken: process.env.EXPO_ACCESS_TOKEN || undefined,
  useFcmV1: true,
});

// ── Express ───────────────────────────────────────────────────────────────────

const app = express();
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN ? process.env.ALLOWED_ORIGIN.split(',') : '*',
}));
app.use(express.json());

// ── Dashboard UI ──────────────────────────────────────────────────────────────

const DASHBOARD = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Push Console</title>
<style>
:root{
  --bg:#0C0C12;--surface:#15151F;--surface2:#1E1E2C;--border:#2C2C40;--border2:#3C3C54;
  --text:#F0F0FC;--text2:#9090B8;--text3:#5A5A78;
  --brand:#FF8B1F;--brand-dim:#FF8B1F22;
  --ok:#34D399;--ok-dim:#34D39920;--err:#F87171;--err-dim:#F8717120;
}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;-webkit-font-smoothing:antialiased}

/* ── Login ────────────────────────────────────────────── */
#login-page{
  position:fixed;inset:0;background:var(--bg);
  display:flex;align-items:center;justify-content:center;z-index:100;
  padding:24px;
}
.login-wrap{width:100%;max-width:420px;display:flex;flex-direction:column;gap:36px}
.login-brand{display:flex;flex-direction:column;gap:8px}
.login-icon{
  width:56px;height:56px;border-radius:16px;
  background:linear-gradient(135deg,#FF8B1F,#E06000);
  display:flex;align-items:center;justify-content:center;
  font-size:26px;box-shadow:0 8px 24px #FF8B1F40;
  margin-bottom:4px;
}
.login-title{font-size:28px;font-weight:800;color:var(--text);letter-spacing:-.5px}
.login-subtitle{font-size:14px;color:var(--text2);line-height:1.5}
.login-form{display:flex;flex-direction:column;gap:16px}
.login-fieldset{display:flex;flex-direction:column;gap:6px}
.login-fieldset label{font-size:12px;font-weight:600;color:var(--text2);text-transform:uppercase;letter-spacing:.6px}
.login-fieldset input{
  padding:14px 16px;background:var(--surface);border:1.5px solid var(--border);
  border-radius:12px;font-size:14px;font-family:monospace;color:var(--text);
  outline:none;transition:border-color .15s,box-shadow .15s;width:100%;
}
.login-fieldset input::-webkit-input-placeholder{color:var(--text2);opacity:.6}
.login-fieldset input::placeholder{color:var(--text2);opacity:.6}
.login-fieldset input:focus{border-color:var(--brand);box-shadow:0 0 0 3px var(--brand-dim)}
.login-fieldset input.error{border-color:var(--err);box-shadow:0 0 0 3px var(--err-dim)}
.login-submit{
  padding:15px;background:var(--brand);color:#fff;border:none;
  border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;
  transition:opacity .15s,transform .1s;width:100%;
}
.login-submit:hover{opacity:.9}
.login-submit:active{transform:scale(.98)}
.login-submit:disabled{opacity:.45;cursor:not-allowed;transform:none}
#login-error{
  display:none;background:var(--err-dim);border:1px solid var(--err);
  border-radius:10px;padding:11px 14px;font-size:13px;color:var(--err);
}
.login-hint{font-size:12px;color:var(--text3);text-align:center;line-height:1.6}

/* ── Dashboard ────────────────────────────────────────── */
#dashboard{display:none;min-height:100vh;padding:24px 20px 48px}
.wrap{max-width:720px;margin:0 auto;display:flex;flex-direction:column;gap:20px}
header{
  display:flex;align-items:center;justify-content:space-between;
  padding:16px 20px;background:var(--surface);border:1px solid var(--border);
  border-radius:16px;
}
.brand{display:flex;align-items:center;gap:12px}
.brand-icon{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#FF8B1F,#E06000);display:flex;align-items:center;justify-content:center;font-size:18px}
.brand-text h1{font-size:16px;font-weight:700;color:var(--text)}
.brand-text span{font-size:11px;color:var(--text3)}
.header-right{display:flex;align-items:center;gap:10px}
#conn-status{font-size:12px;color:var(--text2);display:flex;align-items:center;gap:5px}
.dot{width:8px;height:8px;border-radius:50%;background:var(--ok)}
.dot.err{background:var(--err)}
.signout-btn{
  font-size:12px;font-weight:600;color:var(--text2);background:var(--surface2);
  border:1px solid var(--border);border-radius:8px;padding:6px 14px;cursor:pointer;
  transition:color .15s,border-color .15s;
}
.signout-btn:hover{color:var(--err);border-color:var(--err)}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.card{
  background:var(--surface);border:1px solid var(--border);border-radius:16px;
  padding:20px;display:flex;flex-direction:column;gap:6px;
}
.card-value{font-size:38px;font-weight:800;color:var(--text);line-height:1}
.card-label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.7px;color:var(--text3)}
.section{
  background:var(--surface);border:1px solid var(--border);border-radius:16px;
  padding:20px;display:flex;flex-direction:column;gap:14px;
}
.section-header{display:flex;align-items:center;justify-content:space-between}
.section-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--text3)}
.form-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.field{display:flex;flex-direction:column;gap:6px}
.field label{font-size:12px;font-weight:600;color:var(--text2)}
.field input,.field textarea{
  padding:10px 13px;background:var(--surface2);border:1px solid var(--border);
  border-radius:9px;font-size:13px;color:var(--text);font-family:inherit;
  outline:none;resize:vertical;transition:border-color .15s,box-shadow .15s;
}
.field input::-webkit-input-placeholder,.field textarea::-webkit-input-placeholder{color:var(--text2);opacity:.5}
.field input::placeholder,.field textarea::placeholder{color:var(--text2);opacity:.5}
.field input:focus,.field textarea:focus{border-color:var(--brand);box-shadow:0 0 0 3px var(--brand-dim)}
.field textarea{min-height:72px}
.hint{font-size:11px;color:var(--text3)}
.actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
button{padding:10px 18px;border:none;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer;transition:opacity .15s}
button:hover{opacity:.84}
button:disabled{opacity:.35;cursor:not-allowed}
.btn-primary{background:var(--brand);color:#fff}
.btn-secondary{background:var(--surface2);color:var(--text2);border:1px solid var(--border)}
.btn-sm{padding:5px 12px;font-size:12px}
.tokens-list{display:flex;flex-direction:column;gap:8px}
.token-row{display:flex;align-items:center;gap:10px;padding:10px 13px;background:var(--surface2);border:1px solid var(--border);border-radius:10px}
.token-text{font-family:monospace;font-size:11px;color:var(--text2);flex:1;word-break:break-all}
.log-list{display:flex;flex-direction:column;max-height:260px;overflow-y:auto}
.log-entry{display:flex;gap:14px;padding:8px 0;border-bottom:1px solid var(--border);font-size:12px}
.log-entry:last-child{border-bottom:none}
.log-time{color:var(--text3);white-space:nowrap;font-size:11px;font-family:monospace}
.ok{color:var(--ok)}.err{color:var(--err)}.info{color:var(--text)}
.hidden{display:none}
#spinner{display:none;width:15px;height:15px;border:2px solid var(--border2);border-top-color:var(--brand);border-radius:50%;animation:spin .65s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
</style>
</head>
<body>

<!-- ── Login ───────────────────────────────────────────────────────────────── -->
<div id="login-page">
  <div class="login-wrap">
    <div class="login-brand">
      <div class="login-icon">🔔</div>
      <div class="login-title">Push Console</div>
      <div class="login-subtitle">Habit Tracker backend dashboard.<br>Enter your admin key to continue.</div>
    </div>
    <div class="login-form">
      <div class="login-fieldset">
        <label>Admin API Key</label>
        <input id="login-key" type="password" placeholder="ht-admin-…"
               autocomplete="current-password"
               onkeydown="if(event.key==='Enter') login()" />
      </div>
      <div id="login-error">Invalid admin key — check your <code>ADMIN_API_KEY</code> environment variable.</div>
      <button class="login-submit" id="login-btn" onclick="login()">Sign In →</button>
      <p class="login-hint">If <code>ADMIN_API_KEY</code> is not set on the server,<br>leave the field blank and sign in.</p>
    </div>
  </div>
</div>

<!-- ── Dashboard ──────────────────────────────────────────────────────────── -->
<div id="dashboard">
<div class="wrap">

  <header>
    <div class="brand">
      <div class="brand-icon">🔔</div>
      <div class="brand-text">
        <h1>Push Console</h1>
        <span>Habit Tracker · Upstash · Vercel</span>
      </div>
    </div>
    <div class="header-right">
      <span id="conn-status"><span class="dot"></span>Connected</span>
      <button class="signout-btn" onclick="signOut()">Sign Out</button>
    </div>
  </header>

  <div class="grid">
    <div class="card">
      <div class="card-value" id="device-count">—</div>
      <div class="card-label">Registered Devices</div>
    </div>
    <div class="card">
      <div class="card-value" id="summary-hour">—</div>
      <div class="card-label">Daily Summary (IST)</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Send Notification</div>
    <div class="field">
      <label>Title</label>
      <input id="notif-title" placeholder="e.g. Time to drink water" />
    </div>
    <div class="field">
      <label>Message</label>
      <textarea id="notif-body" placeholder="Notification body text…"></textarea>
    </div>
    <div class="form-row">
      <div class="field">
        <label>Habit ID <span class="hint">(optional · deep link)</span></label>
        <input id="notif-habit" placeholder="paste a habit id" />
      </div>
      <div class="field">
        <label>Image URL <span class="hint">(optional)</span></label>
        <input id="notif-img" type="url" placeholder="https://…" />
      </div>
    </div>
    <div class="actions">
      <button class="btn-primary" onclick="sendCustom()">Send to All Devices</button>
      <div id="spinner"></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Daily Summary</div>
    <div class="form-row">
      <div class="field">
        <label>Title</label>
        <input id="summary-title" placeholder="Daily Summary" />
      </div>
      <div class="field">
        <label>Message</label>
        <input id="summary-body" placeholder="Tap to see yesterday's recap…" />
      </div>
    </div>
    <div class="actions">
      <button class="btn-secondary" onclick="sendSummary()">Send Daily Summary</button>
      <button class="btn-secondary" onclick="loadStatus()">Refresh</button>
    </div>
  </div>

  <div class="section" id="tokens-section">
    <div class="section-header">
      <span class="section-title">Registered Tokens</span>
      <div style="display:flex;gap:8px;align-items:center">
        <span style="font-size:11px;color:var(--text3)">No selection = send to all</span>
        <button class="btn-secondary btn-sm" onclick="toggleTokens()">Show</button>
      </div>
    </div>
    <div class="tokens-list hidden" id="tokens-list"></div>
  </div>

  <div class="section">
    <div class="section-title">Activity Log</div>
    <div class="log-list" id="log-list">
      <div class="log-entry"><span class="log-time">—</span><span class="info">Waiting for activity…</span></div>
    </div>
  </div>

</div>
</div>
<script>
  const log = [];
  let tokensVisible = false;
  let lastTokens = [];

  // ── Auth ──────────────────────────────────────────────────────────────────

  function getKey() { return localStorage.getItem('adminKey') || ''; }

  function adminHeaders(extra = {}) {
    const key = getKey();
    return { 'Content-Type': 'application/json', ...(key ? { 'X-Admin-Key': key } : {}), ...extra };
  }

  async function login() {
    const key = document.getElementById('login-key').value.trim();
    const inp = document.getElementById('login-key');
    const btn = document.getElementById('login-btn');
    const err = document.getElementById('login-error');
    inp.classList.remove('error');
    err.style.display = 'none';
    btn.disabled = true; btn.textContent = 'Signing in…';
    err.style.display = 'none';
    try {
      const res = await fetch('/status', { headers: { 'X-Admin-Key': key } });
      if (res.ok) {
        localStorage.setItem('adminKey', key);
        inp.classList.remove('error');
        showDashboard();
      } else {
        inp.classList.add('error');
        err.style.display = 'block';
        btn.disabled = false; btn.textContent = 'Sign In →';
      }
    } catch {
      err.textContent = 'Server unreachable — is the backend running?';
      err.style.display = 'block';
      inp.classList.add('error');
      btn.disabled = false; btn.textContent = 'Sign In →';
    }
  }

  function signOut() {
    localStorage.removeItem('adminKey');
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('login-page').style.display = 'flex';
    document.getElementById('login-key').value = '';
  }

  function showDashboard() {
    document.getElementById('login-page').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    loadStatus();
  }

  // On load — check if already authenticated
  (async () => {
    const key = getKey();
    if (!key) { return; } // show login page
    const res = await fetch('/status', { headers: { 'X-Admin-Key': key } }).catch(() => null);
    if (res && res.ok) showDashboard();
    // else: leave login page visible
  })();

  function addLog(msg, type = 'info') {
    const ts = new Date().toLocaleTimeString();
    log.unshift({ ts, msg, type });
    renderLog();
  }

  function renderLog() {
    const el = document.getElementById('log-list');
    el.innerHTML = log.slice(0, 30).map(e =>
      '<div class="log-entry"><span class="log-time">' + e.ts + '</span><span class="' + e.type + '">' + e.msg + '</span></div>'
    ).join('') || '<div class="log-entry"><span class="log-time">—</span><span class="info">No activity yet</span></div>';
  }

  function renderTokens(tokens) {
    lastTokens = tokens;
    const el = document.getElementById('tokens-list');
    if (!tokens.length) { el.innerHTML = '<span style="font-size:12px;color:#94a3b8">No devices registered</span>'; return; }
    el.innerHTML = tokens.map((t, i) =>
      '<label class="token-row" style="cursor:pointer;display:flex;gap:10px;align-items:center">' +
      '<input type="checkbox" class="token-checkbox" value="' + t + '" style="accent-color:#2563eb" />' +
      '<span class="token-text">' + t.substring(0, 40) + '…</span>' +
      '</label>'
    ).join('');
  }

  function getSelectedTokens() {
    return Array.from(document.querySelectorAll('.token-checkbox:checked')).map(cb => cb.value);
  }

  function toggleTokens() {
    tokensVisible = !tokensVisible;
    document.getElementById('tokens-list').classList.toggle('hidden', !tokensVisible);
    document.querySelector('#tokens-section .btn-secondary').textContent = tokensVisible ? 'Hide' : 'Show';
    if (tokensVisible) renderTokens(lastTokens);
  }

  function spin(on) { document.getElementById('spinner').style.display = on ? 'block' : 'none'; }

  async function loadStatus() {
    spin(true);
    try {
      const res = await fetch('/status', { headers: { 'X-Admin-Key': getKey() } });
      if (!res.ok) throw new Error('Status ' + res.status);
      const data = await res.json();
      document.getElementById('device-count').textContent = data.registeredDevices;
      document.getElementById('summary-hour').textContent = data.dailySummaryIST || (String(data.dailySummaryHour).padStart(2, '0') + ':00');
      document.getElementById('conn-status').innerHTML = '<span class="dot"></span>Connected';
      renderTokens(data.tokens || []);
    } catch (e) {
      document.getElementById('conn-status').innerHTML = '<span class="dot err"></span>Error';
      addLog('Status fetch failed: ' + e.message, 'err');
    } finally { spin(false); }
  }

  async function sendCustom() {
    const title    = document.getElementById('notif-title').value.trim();
    const body     = document.getElementById('notif-body').value.trim();
    const habitId  = document.getElementById('notif-habit').value.trim();
    const imgUrl   = document.getElementById('notif-img').value.trim();
    const selected = getSelectedTokens();

    if (!title || !body) { addLog('Title and message are required', 'err'); return; }

    const target = selected.length ? selected.length + ' selected device(s)' : 'all devices';
    addLog('Sending "' + title + '" → ' + target + '…', 'info');
    spin(true);
    try {
      const payload = {
        title,
        body,
        data: { source: 'dashboard', ...(habitId ? { screen: '/habit', habitId } : {}) },
        ...(imgUrl ? { imageUrl: imgUrl } : {}),
        ...(selected.length ? { to: selected } : {}),
      };
      const res = await fetch('/send', {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (res.ok) addLog('Sent to ' + d.sent + ' device(s) ✓', 'ok');
      else addLog('Failed: ' + d.error, 'err');
    } catch (e) { addLog('Network error: ' + e.message, 'err'); }
    finally { spin(false); loadStatus(); }
  }

  async function sendSummary() {
    const title = document.getElementById('summary-title').value.trim() || undefined;
    const body  = document.getElementById('summary-body').value.trim() || undefined;
    addLog('Sending daily summary…', 'info');
    spin(true);
    try {
      const res = await fetch('/api/daily-summary', {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({ ...(title ? { title } : {}), ...(body ? { body } : {}) }),
      });
      const d = await res.json();
      if (res.ok) addLog('Daily summary sent to ' + d.sent + ' device(s) ✓', 'ok');
      else addLog('Failed: ' + d.error, 'err');
    } catch (e) { addLog('Network error: ' + e.message, 'err'); }
    finally { spin(false); }
  }

  loadStatus();
  setInterval(loadStatus, 15000);
</script>
</body>
</html>`;

// ── Routes ────────────────────────────────────────────────────────────────────

app.get('/', (_req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(DASHBOARD);
});

/** Rich status for the dashboard — includes token list */
app.get('/status', requireAdmin, async (_req, res) => {
  try {
    const count = await redis.scard(TOKENS_KEY);
    const tokens = count > 0 ? await redis.smembers(TOKENS_KEY) : [];
    res.json({
      status: 'ok',
      registeredDevices: count,
      // Both UTC (for cron debugging) and IST (for display)
      dailySummaryUTC: `${String(DAILY_SUMMARY_UTC_HOUR).padStart(2,'0')}:${String(DAILY_SUMMARY_UTC_MINUTE).padStart(2,'0')} UTC`,
      dailySummaryIST: DAILY_SUMMARY_IST,
      // Keep legacy key so old dashboard JS doesn't break
      dailySummaryHour: DAILY_SUMMARY_UTC_HOUR,
      tokens,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/** Register a device's Expo push token in Redis (persisted across restarts). */
app.post('/register', requireDevice, async (req, res) => {
  const { token } = req.body ?? {};
  if (!Expo.isExpoPushToken(token)) {
    return res.status(400).json({ error: 'Invalid or missing Expo push token' });
  }
  await redis.sadd(TOKENS_KEY, token);
  const count = await redis.scard(TOKENS_KEY);
  console.log(`[register] ${token} (${count} total)`);
  return res.json({ success: true, count });
});

/** Remove a token — call on logout or when a DeviceNotRegistered receipt is received. */
app.post('/unregister', requireDevice, async (req, res) => {
  const { token } = req.body ?? {};
  await redis.srem(TOKENS_KEY, token);
  const count = await redis.scard(TOKENS_KEY);
  console.log(`[unregister] token removed (${count} remaining)`);
  return res.json({ success: true, count });
});

/** Send a notification. Body: { title?, body?, data?, imageUrl?, to?: string[] } */
app.post('/send', requireAdmin, async (req, res) => {
  const { title = 'Hello', body = 'Test notification', data = {}, imageUrl, to } = req.body ?? {};
  try {
    const result = await sendToAll({ title, body, data, imageUrl, targetTokens: Array.isArray(to) ? to : [] });
    if (result.sent === 0) return res.status(400).json({ error: 'No registered devices to send to' });
    return res.json({ success: true, sent: result.sent, tickets: result.tickets });
  } catch (e) {
    console.error('[send] Error:', e);
    return res.status(500).json({ error: 'Failed to send notifications' });
  }
});

/**
 * Daily summary push — triggered by Vercel Cron (GET) or manually (POST).
 * Tapping the notification opens the /summary screen in the app which shows
 * yesterday's per-habit completion status.
 * POST body accepts optional { title, body } to customise the message.
 */
async function handleDailySummary(req, res) {
  const {
    title = 'Daily Summary',
    body = "Tap to see how your habits went yesterday and keep your streaks alive.",
  } = req.body ?? {};

  try {
    const result = await sendToAll({
      title,
      body,
      data: { source: 'daily-summary', screen: '/summary' },
    });
    if (result.sent === 0) return res.status(400).json({ error: 'No registered devices' });
    console.log(`[daily-summary] Sent to ${result.sent} device(s)`);
    return res.json({ success: true, sent: result.sent });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}

// GET  — called by Vercel Cron using CRON_SECRET, or manually with ADMIN_API_KEY
app.get('/api/daily-summary',  requireCronOrAdmin, handleDailySummary);
// POST — called manually from the dashboard (always requires ADMIN_API_KEY)
app.post('/api/daily-summary', requireAdmin,       handleDailySummary);

// ── Core helpers ──────────────────────────────────────────────────────────────

/**
 * Fetch tokens from Redis, build messages, send via Expo in chunks.
 * When `targetTokens` is a non-empty array, only those tokens receive the push;
 * otherwise falls back to every token stored in Redis.
 * Maps ticket IDs back to tokens so DeviceNotRegistered receipts can prune Redis.
 */
async function sendToAll({ title, body, data, imageUrl = undefined, targetTokens = [] }) {
  const allTokens = await redis.smembers(TOKENS_KEY);
  if (!allTokens || allTokens.length === 0) return { sent: 0, tickets: [] };

  const tokenPool = targetTokens.length > 0 ? targetTokens : allTokens;
  const validTokens = tokenPool.filter(t => Expo.isExpoPushToken(t));
  const messages = validTokens.map(to => ({
    to,
    sound: 'default',
    title,
    body,
    data,
    ...(imageUrl ? { imageUrl } : {}),
  }));

  const chunks = expo.chunkPushNotifications(messages);
  const tickets = [];
  for (const chunk of chunks) {
    const batch = await expo.sendPushNotificationsAsync(chunk);
    tickets.push(...batch);
  }

  // Map ticket IDs → tokens for receipt-based pruning
  const ticketTokenMap = new Map();
  for (let i = 0; i < tickets.length; i++) {
    const t = tickets[i];
    if (t.status === 'ok' && t.id) ticketTokenMap.set(t.id, validTokens[i]);
  }

  setTimeout(() => checkReceipts(tickets, ticketTokenMap).catch(console.error), 15_000);
  return { sent: messages.length, tickets };
}

/**
 * Poll Expo receipt endpoint 15 s after send.
 * On DeviceNotRegistered, removes the dead token from Redis automatically.
 */
async function checkReceipts(tickets, ticketTokenMap) {
  const receiptIds = tickets
    .filter(t => t.status === 'ok' && t.id)
    .map(t => t.id);

  if (!receiptIds.length) return;

  const idChunks = expo.chunkPushNotificationReceiptIds(receiptIds);
  for (const chunk of idChunks) {
    const receipts = await expo.getPushNotificationReceiptsAsync(chunk);
    for (const [receiptId, receipt] of Object.entries(receipts)) {
      if (receipt.status === 'error') {
        console.error(`[receipt] ${receiptId}: ${receipt.message}`);
        if (receipt.details?.error === 'DeviceNotRegistered') {
          const token = ticketTokenMap.get(receiptId);
          if (token) {
            await redis.srem(TOKENS_KEY, token);
            console.log('[receipt] Pruned dead token from Redis:', token);
          }
        }
      }
    }
  }
}

// ── Start (local dev only — Vercel imports the module, doesn't call listen) ───

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Push backend running on http://localhost:${PORT}`);
  });
}

export default app;
