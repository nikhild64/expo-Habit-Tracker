import cors from 'cors';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { Expo } from 'expo-server-sdk';
import express from 'express';
import { Redis } from '@upstash/redis';
import webpush from 'web-push';

import { mountCosmaAiRoutes } from './cosma-ai.js';

dotenv.config();

const PORT = parseInt(process.env.PORT || '4000', 10);

// ── Redis namespaces ──────────────────────────────────────────────────────────
// Mobile (Expo) tokens — pre-existing.
const TOKENS_KEY            = 'habit_tracker:push_tokens';
// PWA web-push subscriptions (SET of JSON.stringify(PushSubscription)).
const WEB_PUSH_SUBS_KEY     = 'habit_tracker:web_push_subs';
// Per-subscription reminder schedule.  Key: `<prefix><subId>` → JSON
// `{ slots, quietHours, tzOffsetMinutes, lastFired }`.  `lastFired` is internal
// book-keeping used by the `/api/web-tick` cron to dedupe across runs.
const WEB_REMINDERS_PREFIX  = 'habit_tracker:web_reminders:';
// Sorted set of pending one-shot snooze fires.  Score = UTC ms timestamp,
// member = JSON `{ subscription, payload, fireAt }`.
const WEB_SNOOZE_QUEUE_KEY  = 'habit_tracker:web_snooze_queue';

// Per-app_id namespaces (additive — see _SHARED-NOTIFICATIONS.md §2 in the
// portfolio docs). Each new portfolio app posts
// { token, app_id, language?, user_id? } to /register; tokens land in
// push:tokens:<app_id> instead of TOKENS_KEY. The legacy
// habit_tracker:push_tokens set above is untouched so Habit Tracker's
// daily/weekly summary crons keep working exactly as before.
const PUSH_TOKENS_PREFIX    = 'push:tokens:';
const PUSH_META_PREFIX      = 'push:meta:';

const ADMIN_API_KEY  = process.env.ADMIN_API_KEY  || null;
const DEVICE_API_KEY = process.env.DEVICE_API_KEY || null;

/**
 * Vercel automatically injects CRON_SECRET as an env var on every deployment
 * and sends it as "Authorization: Bearer <secret>" on each cron invocation.
 * We read it here so the cron endpoints can validate it without needing the
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

// ── VAPID (Web Push) ──────────────────────────────────────────────────────────
//
// Generate once with `npx web-push generate-vapid-keys` and set
// VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT in the env.  The public
// key is exposed via `GET /web/vapid` so the PWA can subscribe.  Registrations
// are still accepted when VAPID is unset (the schedule is just stored); only
// the actual `webpush.sendNotification` calls are skipped.
const VAPID_PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY  || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT     = process.env.VAPID_SUBJECT     || 'mailto:nikhildhawan.dev@gmail.com';

function isVapidConfigured() {
  return Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
}

if (isVapidConfigured()) {
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    console.log('[web-push] VAPID configured (subject=' + VAPID_SUBJECT + ').');
  } catch (e) {
    console.error('[web-push] Failed to configure VAPID:', e.message || e);
  }
} else {
  console.warn('[web-push] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set — web push send disabled (registrations + schedule writes still accepted).');
}

// ── Auth ──────────────────────────────────────────────────────────────────────

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
 * Device-level access — used by mobile app for /register and /unregister and by
 * the PWA for /web/register, /web/unregister, /web/schedule, /api/snooze.
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
 * Cron-or-admin access — used for GET /api/daily-summary, /api/weekly-summary,
 * and /api/web-tick.
 *
 * Accepts two callers:
 *  1. ADMIN_API_KEY  — manual trigger from the dashboard
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

// ── Web-push helpers ──────────────────────────────────────────────────────────

/** Stable 16-char hex id derived from a web-push subscription endpoint. */
function subIdFromEndpoint(endpoint) {
  return crypto.createHash('sha256').update(String(endpoint || '')).digest('hex').slice(0, 16);
}

/** Returns true if `sub` is a structurally-valid PushSubscription JSON. */
function isValidSubscription(sub) {
  return Boolean(
    sub && typeof sub === 'object'
    && typeof sub.endpoint === 'string' && /^https?:\/\//.test(sub.endpoint)
    && sub.keys && typeof sub.keys === 'object'
    && typeof sub.keys.p256dh === 'string' && sub.keys.p256dh.length > 0
    && typeof sub.keys.auth   === 'string' && sub.keys.auth.length   > 0,
  );
}

/**
 * Mirror of [src/lib/habits/quiet-hours.ts](../src/lib/habits/quiet-hours.ts)
 * `isInQuietHours` — overnight wrap aware (start > end → curr >= start || curr < end).
 */
function isInQuietHours(hour, minute, qh) {
  if (!qh || !qh.enabled) return false;
  const curr  = hour * 60 + minute;
  const start = (qh.startHour ?? 0) * 60 + (qh.startMinute ?? 0);
  const end   = (qh.endHour   ?? 0) * 60 + (qh.endMinute   ?? 0);
  if (start === end) return false;
  if (start > end) return curr >= start || curr < end; // wraps midnight
  return curr >= start && curr < end;
}

/**
 * Defensively read a JSON value from Redis.  Upstash auto-parses JSON strings,
 * but older SDKs (and non-JSON-looking values) return raw strings — handle both.
 */
async function getJson(key) {
  const raw = await redis.get(key);
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return null; }
}

/**
 * Defensively parse a SET / ZSET member.  Upstash auto-parses JSON-shaped
 * strings into objects on SMEMBERS / ZRANGE; older SDKs return raw strings.
 */
function parseMember(item) {
  if (item == null) return null;
  if (typeof item === 'object') return item;
  try { return JSON.parse(item); } catch { return null; }
}

/**
 * Send a single web-push notification.  Never throws.
 *
 * On HTTP 404 / 410 (sub expired or unsubscribed) the subscription is
 * automatically pruned from `WEB_PUSH_SUBS_KEY` and its reminders hash is DEL'd
 * — mirrors the existing Expo `DeviceNotRegistered` cleanup.
 *
 * @param subscription Parsed PushSubscription object.
 * @param payload      JSON-serializable payload sent as the push body.
 * @param opts.ttl     TTL in seconds (default 60 — reminders are time-sensitive).
 * @param opts.member  Optional exact Redis set member string for cheap SREM
 *                     without re-scanning the set.
 */
async function sendWebPush(subscription, payload, { ttl = 60, member = null } = {}) {
  if (!isVapidConfigured()) return { ok: false, code: 'no-vapid' };
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload), { TTL: ttl });
    return { ok: true };
  } catch (err) {
    const code = err?.statusCode;
    if (code === 404 || code === 410) {
      let dead = member;
      if (!dead) {
        const all = await redis.smembers(WEB_PUSH_SUBS_KEY);
        // Each SMEMBERS entry may be a parsed object (auto by Upstash) or the
        // raw JSON string; SREM accepts either shape and will match.
        dead = (all || []).find(item => {
          const parsed = parseMember(item);
          return parsed && parsed.endpoint === subscription.endpoint;
        }) || null;
      }
      if (dead) await redis.srem(WEB_PUSH_SUBS_KEY, dead);
      const subId = subIdFromEndpoint(subscription.endpoint);
      await redis.del(WEB_REMINDERS_PREFIX + subId);
      console.log(`[web-push] Pruned dead sub (${code}): ${subId}`);
      return { ok: false, pruned: true, code };
    }
    console.error(`[web-push] Send failed (${code ?? '?'}): ${err?.message ?? err}`);
    return { ok: false, code };
  }
}

// ── Express ───────────────────────────────────────────────────────────────────

const app = express();
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN ? process.env.ALLOWED_ORIGIN.split(',') : '*',
}));
app.use(express.json({ limit: '128kb' }));

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
  --web:#6366F1;--web-dim:#6366F122;
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
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
@media (max-width:560px){.grid{grid-template-columns:1fr}}
.card{
  background:var(--surface);border:1px solid var(--border);border-radius:16px;
  padding:20px;display:flex;flex-direction:column;gap:6px;
}
.card-value{font-size:32px;font-weight:800;color:var(--text);line-height:1}
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
.toggle-row{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text2);cursor:pointer;user-select:none}
.toggle-row input{accent-color:var(--web);width:14px;height:14px;cursor:pointer}
.tokens-list{display:flex;flex-direction:column;gap:8px}
.token-row{display:flex;align-items:center;gap:10px;padding:10px 13px;background:var(--surface2);border:1px solid var(--border);border-radius:10px}
.token-text{font-family:monospace;font-size:11px;color:var(--text2);flex:1;word-break:break-all}
.subid-tag{font-family:monospace;font-size:11px;color:var(--web);background:var(--web-dim);padding:3px 7px;border-radius:6px;letter-spacing:.5px}
.log-list{display:flex;flex-direction:column;max-height:260px;overflow-y:auto}
.log-entry{display:flex;gap:14px;padding:8px 0;border-bottom:1px solid var(--border);font-size:12px}
.log-entry:last-child{border-bottom:none}
.log-time{color:var(--text3);white-space:nowrap;font-size:11px;font-family:monospace}
.ok{color:var(--ok)}.err{color:var(--err)}.info{color:var(--text)}
.hidden{display:none}
#spinner{display:none;width:15px;height:15px;border:2px solid var(--border2);border-top-color:var(--brand);border-radius:50%;animation:spin .65s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}

/* ── App selector (portfolio mode) ──────────────────────── */
.app-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:10px 14px}
.app-bar-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--text3)}
.app-pills{display:flex;gap:8px;flex-wrap:wrap;flex:1;align-items:center}
.app-pill{padding:6px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;font-size:12px;color:var(--text2);cursor:pointer;display:inline-flex;align-items:center;gap:7px;transition:all .15s;font-weight:600}
.app-pill:hover{color:var(--text);border-color:var(--border2)}
.app-pill.active{background:var(--brand-dim);border-color:var(--brand);color:var(--brand)}
.app-pill-count{font-size:10px;font-weight:700;background:var(--bg);padding:2px 7px;border-radius:5px;color:var(--text3);min-width:18px;text-align:center}
.app-pill.active .app-pill-count{background:var(--brand);color:#fff}
.app-scope-banner{font-size:11px;color:var(--text3);margin-top:-4px;padding-left:4px}
.app-scope-banner code{font-family:monospace;color:var(--text2);background:var(--surface2);padding:1px 6px;border-radius:4px}
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
        <span id="brand-tagline">Portfolio · Upstash · Vercel</span>
      </div>
    </div>
    <div class="header-right">
      <span id="conn-status"><span class="dot"></span>Connected</span>
      <button class="signout-btn" onclick="signOut()">Sign Out</button>
    </div>
  </header>

  <div class="app-bar">
    <span class="app-bar-label">App</span>
    <div id="app-pills" class="app-pills">
      <span style="font-size:11px;color:var(--text3)">Loading…</span>
    </div>
  </div>
  <div class="app-scope-banner" id="app-scope-banner">
    Sending and counts scope to the selected app. Habit Tracker uses the legacy <code>habit_tracker:push_tokens</code> namespace; new apps use <code>push:tokens:&lt;app_id&gt;</code>.
  </div>

  <div class="grid">
    <div class="card">
      <div class="card-value" id="device-count">—</div>
      <div class="card-label">Registered Devices</div>
    </div>
    <div class="card">
      <div class="card-value" id="web-sub-count">—</div>
      <div class="card-label">Web Push Subscriptions</div>
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
      <button class="btn-primary" id="btn-send-custom" onclick="sendCustom()">Send</button>
      <label class="toggle-row" title="Broadcasts to Expo + Web (cosmetic — selective sends still target only Expo tokens)">
        <input type="checkbox" id="notif-include-web" checked />
        <span>Web Push</span>
      </label>
      <span class="hint" id="send-hint">Scopes to selected app</span>
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

  <div class="section">
    <div class="section-title">Weekly Summary</div>
    <div class="hint" style="margin-bottom:8px">Sent automatically every Sunday at 20:00 UTC via Vercel Cron. Deep-links to /weekly-review.</div>
    <div class="form-row">
      <div class="field">
        <label>Title</label>
        <input id="weekly-title" placeholder="Weekly Review" />
      </div>
      <div class="field">
        <label>Message</label>
        <input id="weekly-body" placeholder="How did your habits do this week?…" />
      </div>
    </div>
    <div class="actions">
      <button class="btn-secondary" onclick="sendWeeklySummary()">Send Weekly Summary</button>
    </div>
  </div>

  <div class="section" id="tokens-section">
    <div class="section-header">
      <span class="section-title">Habit Tracker Tokens (legacy pool)</span>
      <div style="display:flex;gap:8px;align-items:center">
        <span style="font-size:11px;color:var(--text3)">Pick tokens to target a subset · no pick = whole pool</span>
        <button class="btn-secondary btn-sm" onclick="toggleTokens()">Show</button>
      </div>
    </div>
    <div class="tokens-list hidden" id="tokens-list"></div>
  </div>

  <div class="section" id="websubs-section">
    <div class="section-header">
      <span class="section-title">Web Push Subscriptions</span>
      <div style="display:flex;gap:8px;align-items:center">
        <span style="font-size:11px;color:var(--text3)">Broadcast targets — read-only</span>
        <button class="btn-secondary btn-sm" onclick="toggleWebSubs()">Show</button>
      </div>
    </div>
    <div class="tokens-list hidden" id="websubs-list"></div>
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
  let tokensVisible   = false;
  let webSubsVisible  = false;
  let lastTokens   = [];
  let lastWebSubs  = [];

  // Portfolio mode: which app does the dashboard scope to?
  // null  = legacy habit_tracker (the original single-app pool).
  // non-null = a per-app pool addressed as push:tokens:<id> server-side.
  // Persisted in localStorage so the operator's selection survives reloads.
  let activeAppId  = localStorage.getItem('activeAppId') || null;
  let perAppCounts = {};

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

  (async () => {
    const key = getKey();
    if (!key) { return; }
    const res = await fetch('/status', { headers: { 'X-Admin-Key': key } }).catch(() => null);
    if (res && res.ok) showDashboard();
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
    el.innerHTML = tokens.map(t =>
      '<label class="token-row" style="cursor:pointer;display:flex;gap:10px;align-items:center">' +
      '<input type="checkbox" class="token-checkbox" value="' + t + '" style="accent-color:#2563eb" />' +
      '<span class="token-text">' + t.substring(0, 40) + '…</span>' +
      '</label>'
    ).join('');
  }

  function renderWebSubs(subs) {
    lastWebSubs = subs;
    const el = document.getElementById('websubs-list');
    if (!subs.length) { el.innerHTML = '<span style="font-size:12px;color:#94a3b8">No web subscriptions yet</span>'; return; }
    el.innerHTML = subs.map(s =>
      '<div class="token-row">' +
      '<span class="subid-tag">' + (s.subId || '?') + '</span>' +
      '<span class="token-text">' + ((s.endpoint || '').substring(0, 56)) + '…</span>' +
      '</div>'
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

  function toggleWebSubs() {
    webSubsVisible = !webSubsVisible;
    document.getElementById('websubs-list').classList.toggle('hidden', !webSubsVisible);
    document.querySelector('#websubs-section .btn-secondary').textContent = webSubsVisible ? 'Hide' : 'Show';
    if (webSubsVisible) renderWebSubs(lastWebSubs);
  }

  function spin(on) { document.getElementById('spinner').style.display = on ? 'block' : 'none'; }

  // ── Portfolio app selector ────────────────────────────────────────────────

  function activeAppLabel() {
    return activeAppId === null ? 'Habit Tracker' : activeAppId;
  }

  function setActiveApp(appId) {
    activeAppId = appId;
    if (appId === null) localStorage.removeItem('activeAppId');
    else                localStorage.setItem('activeAppId', appId);
    renderAppPills();
    updateActiveAppDisplay();
    addLog('Scope → ' + activeAppLabel(), 'info');
  }

  function renderAppPills() {
    const el = document.getElementById('app-pills');
    const items = [{ id: null, label: 'Habit Tracker', count: perAppCounts.__legacy ?? 0 }];
    Object.keys(perAppCounts)
      .filter(k => k !== '__legacy')
      .sort()
      .forEach(id => items.push({ id, label: id, count: perAppCounts[id] }));
    el.innerHTML = items.map(item => {
      const isActive = activeAppId === item.id;
      const onclick  = 'setActiveApp(' + (item.id === null ? 'null' : "'" + String(item.id).replace(/'/g, "\\\\'") + "'") + ')';
      return '<button class="app-pill' + (isActive ? ' active' : '') +
             '" onclick="' + onclick + '">' +
             '<span>' + item.label + '</span>' +
             '<span class="app-pill-count">' + item.count + '</span>' +
             '</button>';
    }).join('');
  }

  function updateActiveAppDisplay() {
    const count = activeAppId === null
      ? (perAppCounts.__legacy ?? 0)
      : (perAppCounts[activeAppId] ?? 0);
    document.getElementById('device-count').textContent = count;
    document.getElementById('brand-tagline').textContent = activeAppLabel() + ' · Upstash · Vercel';
    const btn = document.getElementById('btn-send-custom');
    if (btn) btn.textContent = 'Send to ' + activeAppLabel() + ' (' + count + ')';
    const hint = document.getElementById('send-hint');
    if (hint) {
      hint.textContent = activeAppId === null
        ? 'Broadcasts to legacy habit_tracker + Web subs'
        : 'Broadcasts to push:tokens:' + activeAppId;
    }
  }

  async function loadStatus() {
    spin(true);
    try {
      const res = await fetch('/status', { headers: { 'X-Admin-Key': getKey() } });
      if (!res.ok) throw new Error('Status ' + res.status);
      const data = await res.json();
      const legacyCount = data.tokens?.expo ?? data.registeredDevices ?? 0;
      const webCount    = data.tokens?.web  ?? data.webPushSubs       ?? 0;
      perAppCounts = { __legacy: legacyCount, ...(data.tokens?.perApp || {}) };
      // If the persisted activeAppId no longer exists in perApp (e.g. tokens
      // pruned), gracefully fall back to legacy.
      if (activeAppId !== null && !(activeAppId in perAppCounts)) {
        activeAppId = null;
        localStorage.removeItem('activeAppId');
      }
      renderAppPills();
      updateActiveAppDisplay();
      document.getElementById('web-sub-count').textContent = webCount;
      document.getElementById('summary-hour').textContent  = data.dailySummaryIST || (String(data.dailySummaryHour).padStart(2, '0') + ':00');
      document.getElementById('conn-status').innerHTML     = '<span class="dot"></span>Connected';
      renderTokens(data.expoTokens || []);
      renderWebSubs(data.webSubs  || []);
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

    // Note: per-token selection ("to:" body field) currently lists legacy pool
    // tokens only. For per-app sends, leave selection empty and rely on app_id
    // scoping; the backend pulls from push:tokens:<app_id> instead.
    const scope = activeAppLabel();
    const target = selected.length
      ? selected.length + ' selected token(s) from legacy pool'
      : 'all devices in ' + scope;
    addLog('Sending "' + title + '" → ' + target + '…', 'info');
    spin(true);
    try {
      const payload = {
        title,
        body,
        data: { source: 'dashboard', ...(habitId ? { screen: '/habit', habitId } : {}) },
        ...(imgUrl ? { imageUrl: imgUrl } : {}),
        ...(selected.length ? { to: selected } : {}),
        ...(activeAppId && !selected.length ? { app_id: activeAppId } : {}),
      };
      const res = await fetch('/send', {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (res.ok) {
        const expoMsg = (d.sent || 0) + ' Expo';
        const webMsg  = typeof d.webSent === 'number' ? (' + ' + d.webSent + ' Web') : '';
        const pruneMsg = d.webPruned ? (' · pruned ' + d.webPruned + ' stale web sub(s)') : '';
        const scopeMsg = d.app_id ? (' [' + d.app_id + ']') : '';
        addLog('Sent to ' + expoMsg + webMsg + scopeMsg + ' ✓' + pruneMsg, 'ok');
      } else addLog('Failed: ' + d.error, 'err');
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
      if (res.ok) {
        const webMsg = typeof d.webSent === 'number' ? (' + ' + d.webSent + ' Web') : '';
        addLog('Daily summary sent to ' + (d.sent || 0) + ' Expo' + webMsg + ' ✓', 'ok');
      } else addLog('Failed: ' + d.error, 'err');
    } catch (e) { addLog('Network error: ' + e.message, 'err'); }
    finally { spin(false); }
  }

  async function sendWeeklySummary() {
    const title = document.getElementById('weekly-title').value.trim() || undefined;
    const body  = document.getElementById('weekly-body').value.trim() || undefined;
    addLog('Sending weekly summary…', 'info');
    spin(true);
    try {
      const res = await fetch('/api/weekly-summary', {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({ ...(title ? { title } : {}), ...(body ? { body } : {}) }),
      });
      const d = await res.json();
      if (res.ok) {
        const webMsg = typeof d.webSent === 'number' ? (' + ' + d.webSent + ' Web') : '';
        addLog('Weekly summary sent to ' + (d.sent || 0) + ' Expo' + webMsg + ' ✓', 'ok');
      } else addLog('Failed: ' + d.error, 'err');
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

/**
 * GET /web/vapid — returns the VAPID public key so the PWA can subscribe.
 * PUBLIC: the public key is meant to be shared.
 */
app.get('/web/vapid', (_req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY || null });
});

/** Rich status for the dashboard — includes token list + web sub list. */
app.get('/status', requireAdmin, async (_req, res) => {
  try {
    const [expoCount, webCount] = await Promise.all([
      redis.scard(TOKENS_KEY),
      redis.scard(WEB_PUSH_SUBS_KEY),
    ]);
    const [expoTokens, webSubsRaw] = await Promise.all([
      expoCount > 0 ? redis.smembers(TOKENS_KEY)        : [],
      webCount  > 0 ? redis.smembers(WEB_PUSH_SUBS_KEY) : [],
    ]);
    const webSubs = (webSubsRaw || []).map(item => {
      const sub = parseMember(item);
      return sub
        ? { subId: subIdFromEndpoint(sub.endpoint), endpoint: sub.endpoint }
        : { subId: '?', endpoint: '(invalid)' };
    });

    // Per-app_id pools: enumerate every push:tokens:<app_id> key and
    // return per-app token counts. Cheap on Upstash for ≤ 100 apps.
    const perAppKeys = (await redis.keys(`${PUSH_TOKENS_PREFIX}*`)) || [];
    const perApp = {};
    for (const key of perAppKeys) {
      const id = key.slice(PUSH_TOKENS_PREFIX.length);
      perApp[id] = await redis.scard(key);
    }

    res.json({
      status: 'ok',
      registeredDevices: expoCount,
      webPushSubs: webCount,
      tokens: { expo: expoCount, web: webCount, perApp },
      vapidConfigured: isVapidConfigured(),
      dailySummaryUTC:  `${String(DAILY_SUMMARY_UTC_HOUR).padStart(2,'0')}:${String(DAILY_SUMMARY_UTC_MINUTE).padStart(2,'0')} UTC`,
      dailySummaryIST:  DAILY_SUMMARY_IST,
      dailySummaryHour: DAILY_SUMMARY_UTC_HOUR,
      expoTokens,
      webSubs,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/**
 * Register a device's Expo push token in Redis (persisted across restarts).
 *
 * Per-app routing: when `app_id` is supplied, the token lands in
 * push:tokens:<app_id> and a metadata HASH is written to
 * push:meta:<token>. Without `app_id` we fall back to the legacy
 * habit_tracker:push_tokens key so existing Habit Tracker clients keep
 * working with no code change.
 */
app.post('/register', requireDevice, async (req, res) => {
  const { token, app_id, language, user_id } = req.body ?? {};
  if (!Expo.isExpoPushToken(token)) {
    return res.status(400).json({ error: 'Invalid or missing Expo push token' });
  }
  if (app_id) {
    const setKey = `${PUSH_TOKENS_PREFIX}${app_id}`;
    await redis.sadd(setKey, token);
    await redis.hset(`${PUSH_META_PREFIX}${token}`, {
      app_id,
      language: language ?? 'en',
      ...(user_id ? { user_id } : {}),
      updatedAt: Date.now(),
    });
    const count = await redis.scard(setKey);
    console.log(`[register] ${app_id} · ${token} (${count} total)`);
    return res.json({ success: true, count, app_id });
  }
  await redis.sadd(TOKENS_KEY, token);
  const count = await redis.scard(TOKENS_KEY);
  console.log(`[register] habit_tracker · ${token} (${count} total)`);
  return res.json({ success: true, count });
});

/** Remove a token — call on logout or when a DeviceNotRegistered receipt is received. */
app.post('/unregister', requireDevice, async (req, res) => {
  const { token, app_id } = req.body ?? {};
  if (app_id) {
    const setKey = `${PUSH_TOKENS_PREFIX}${app_id}`;
    await redis.srem(setKey, token);
    await redis.del(`${PUSH_META_PREFIX}${token}`);
    const count = await redis.scard(setKey);
    console.log(`[unregister] ${app_id} · token removed (${count} remaining)`);
    return res.json({ success: true, count, app_id });
  }
  await redis.srem(TOKENS_KEY, token);
  const count = await redis.scard(TOKENS_KEY);
  console.log(`[unregister] habit_tracker · token removed (${count} remaining)`);
  return res.json({ success: true, count });
});

// ── Web Push: registration + schedule + snooze ───────────────────────────────

/**
 * POST /web/register — body `{ subscription }`.
 * Stores the JSON-stringified subscription in `WEB_PUSH_SUBS_KEY` (SADD is
 * idempotent — re-registering the same sub is a no-op).
 */
app.post('/web/register', requireDevice, async (req, res) => {
  const { subscription } = req.body ?? {};
  if (!isValidSubscription(subscription)) {
    return res.status(400).json({ error: 'Invalid subscription — needs endpoint + keys.p256dh + keys.auth' });
  }
  const member = JSON.stringify(subscription);
  await redis.sadd(WEB_PUSH_SUBS_KEY, member);
  const count = await redis.scard(WEB_PUSH_SUBS_KEY);
  const subId = subIdFromEndpoint(subscription.endpoint);
  console.log(`[web/register] ${subId} (${count} total)`);
  return res.json({ ok: true, subId, count });
});

/**
 * POST /web/unregister — body `{ subscription }`.
 * SREMs the sub and DELs the matching reminders hash.  Idempotent.
 */
app.post('/web/unregister', requireDevice, async (req, res) => {
  const { subscription } = req.body ?? {};
  if (!isValidSubscription(subscription)) {
    return res.status(400).json({ error: 'Invalid subscription — needs endpoint + keys.p256dh + keys.auth' });
  }
  const member = JSON.stringify(subscription);
  const subId  = subIdFromEndpoint(subscription.endpoint);
  await Promise.all([
    redis.srem(WEB_PUSH_SUBS_KEY, member),
    redis.del(WEB_REMINDERS_PREFIX + subId),
  ]);
  const count = await redis.scard(WEB_PUSH_SUBS_KEY);
  console.log(`[web/unregister] ${subId} (${count} remaining)`);
  return res.json({ ok: true, count });
});

/**
 * POST /web/schedule — body `{ subscription, slots, quietHours?, tzOffsetMinutes }`.
 *
 * `slots`: array of `{ id, hour, minute, weekdays?, title, body, data }`.
 *   - `hour` / `minute` are **local clock times** (combined with `tzOffsetMinutes`
 *     server-side to find the matching UTC minute).
 *   - `weekdays` (optional): Expo convention `1=Sun … 7=Sat`.  Empty/undefined
 *     = fire every day.
 *
 * `quietHours` (optional): `{ enabled, startHour, startMinute, endHour, endMinute }`.
 *
 * `tzOffsetMinutes`: **positive = ahead of UTC** (e.g. IST is +330).  The PWA
 * client should send `-new Date().getTimezoneOffset()` to follow this convention.
 *
 * Replaces all slots for that sub atomically (single Redis SET).  `lastFired`
 * book-keeping from the previous schedule is preserved so reminders that just
 * fired don't re-fire when the schedule is edited mid-minute.
 */
app.post('/web/schedule', requireDevice, async (req, res) => {
  const { subscription, slots, quietHours, tzOffsetMinutes } = req.body ?? {};
  if (!isValidSubscription(subscription)) {
    return res.status(400).json({ error: 'Invalid subscription' });
  }
  if (!Array.isArray(slots)) {
    return res.status(400).json({ error: 'slots must be an array' });
  }
  const tz = Number.isFinite(tzOffsetMinutes) ? tzOffsetMinutes : 0;

  const cleanSlots = slots
    .filter(s => s && typeof s.id === 'string'
      && Number.isInteger(s.hour)   && s.hour   >= 0 && s.hour   <= 23
      && Number.isInteger(s.minute) && s.minute >= 0 && s.minute <= 59)
    .map(s => ({
      id: s.id,
      hour: s.hour,
      minute: s.minute,
      weekdays: Array.isArray(s.weekdays)
        ? s.weekdays.filter(d => Number.isInteger(d) && d >= 1 && d <= 7)
        : [],
      title: typeof s.title === 'string' && s.title ? s.title : 'Habit reminder',
      body:  typeof s.body  === 'string' && s.body  ? s.body  : 'Time to build your streak.',
      data:  s.data && typeof s.data === 'object' ? s.data : {},
    }));

  const subId  = subIdFromEndpoint(subscription.endpoint);
  const existing = await getJson(WEB_REMINDERS_PREFIX + subId);
  const lastFired = existing && typeof existing.lastFired === 'object' ? existing.lastFired : {};

  const record = {
    slots: cleanSlots,
    quietHours: quietHours && typeof quietHours === 'object' ? quietHours : null,
    tzOffsetMinutes: tz,
    lastFired,
    updatedAt: Date.now(),
  };
  await redis.set(WEB_REMINDERS_PREFIX + subId, JSON.stringify(record));

  console.log(`[web/schedule] ${subId}: ${cleanSlots.length} slot(s) · tz=${tz}m · qh=${quietHours?.enabled ? 'on' : 'off'}`);
  return res.json({ ok: true, subId, slotCount: cleanSlots.length });
});

/**
 * POST /api/snooze — body `{ subscription, habitId, minutes? = 10 }`.
 *
 * Enqueues a one-shot web-push to fire `minutes` from now.  Stored in
 * `WEB_SNOOZE_QUEUE_KEY` (Redis ZSET keyed by UTC ms timestamp).  The
 * `/api/web-tick` cron drains due items.
 */
app.post('/api/snooze', requireDevice, async (req, res) => {
  const { subscription, habitId, minutes } = req.body ?? {};
  if (!isValidSubscription(subscription)) {
    return res.status(400).json({ error: 'Invalid subscription' });
  }
  if (typeof habitId !== 'string' || !habitId) {
    return res.status(400).json({ error: 'Missing habitId' });
  }
  const delayMin = Number.isFinite(minutes) && minutes > 0 && minutes <= 360 ? Math.floor(minutes) : 10;
  const fireAt = Date.now() + delayMin * 60_000;

  const item = JSON.stringify({
    subscription,
    payload: {
      title: 'Habit reminder',
      body:  'Snoozed — ready when you are.',
      data:  { source: 'snooze', screen: '/habit', habitId },
    },
    fireAt,
  });
  await redis.zadd(WEB_SNOOZE_QUEUE_KEY, { score: fireAt, member: item });

  const subId = subIdFromEndpoint(subscription.endpoint);
  console.log(`[snooze] ${subId} · habit=${habitId} · +${delayMin}m (fires @ ${new Date(fireAt).toISOString()})`);
  return res.json({ ok: true, subId, fireAt, minutes: delayMin });
});

/**
 * Send a notification.
 * Body: { title?, body?, data?, imageUrl?, to?: string[], app_id? }
 *
 * Token resolution:
 *   1. `to: string[]`   — exactly those tokens (overrides app_id)
 *   2. `app_id`         — every token in push:tokens:<app_id>
 *   3. neither          — every token in the legacy habit_tracker:push_tokens
 *                         (preserves current Habit Tracker cron behavior)
 */
app.post('/send', requireAdmin, async (req, res) => {
  const { title = 'Hello', body = 'Test notification', data = {}, imageUrl, to, app_id } = req.body ?? {};
  try {
    const result = await sendToAll({
      title,
      body,
      data,
      imageUrl,
      targetTokens: Array.isArray(to) ? to : [],
      app_id: app_id ?? null,
    });
    if (result.sent === 0 && result.webSent === 0) {
      return res.status(400).json({ error: 'No registered devices to send to' });
    }
    return res.json({
      success: true,
      sent: result.sent,
      webSent: result.webSent,
      webPruned: result.webPruned,
      tickets: result.tickets,
      app_id: app_id ?? null,
    });
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
    if (result.sent === 0 && result.webSent === 0) {
      return res.status(400).json({ error: 'No registered devices' });
    }
    console.log(`[daily-summary] Sent to ${result.sent} Expo + ${result.webSent} Web`);
    return res.json({
      success: true,
      sent: result.sent,
      webSent: result.webSent,
      webPruned: result.webPruned,
    });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}

// GET  — called by Vercel Cron using CRON_SECRET, or manually with ADMIN_API_KEY
app.get('/api/daily-summary',  requireCronOrAdmin, handleDailySummary);
// POST — called manually from the dashboard (always requires ADMIN_API_KEY)
app.post('/api/daily-summary', requireAdmin,       handleDailySummary);

/**
 * Weekly summary push — triggered by Vercel Cron on Sunday 20:00 UTC (GET) or
 * manually (POST). Tapping the notification deep-links to /weekly-review in the app.
 * POST body accepts optional { title, body } to customise the message.
 */
async function handleWeeklySummary(req, res) {
  const {
    title = 'Weekly Review',
    body  = "How did your habits do this week? Tap to see your score and start strong tomorrow.",
  } = req.body ?? {};

  try {
    const result = await sendToAll({
      title,
      body,
      data: { source: 'weekly-summary', screen: '/weekly-review' },
    });
    if (result.sent === 0 && result.webSent === 0) {
      return res.status(400).json({ error: 'No registered devices' });
    }
    console.log(`[weekly-summary] Sent to ${result.sent} Expo + ${result.webSent} Web`);
    return res.json({
      success: true,
      sent: result.sent,
      webSent: result.webSent,
      webPruned: result.webPruned,
    });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}

app.get('/api/weekly-summary',  requireCronOrAdmin, handleWeeklySummary);
app.post('/api/weekly-summary', requireAdmin,       handleWeeklySummary);

// ── Web Push tick (every minute) ──────────────────────────────────────────────

/**
 * GET /api/web-tick — Vercel Cron every minute.
 *
 * For every web-push subscription:
 *   1. Load its reminder schedule (skip if none).
 *   2. Compute the **local** hour:minute using `tzOffsetMinutes`.
 *   3. Skip if inside quiet hours.
 *   4. For each slot whose weekday matches (or has no weekday filter) and
 *      whose hour:minute matches the current local minute — fire a web-push,
 *      remembering the fire-key in `lastFired` to dedupe across cron runs.
 *   5. Drain the snooze queue (any items whose UTC `fireAt` ≤ now).
 *
 * On 404/410 from the push service the sub is auto-pruned.
 */
async function handleWebTick(_req, res) {
  if (!isVapidConfigured()) {
    return res.json({ ok: true, scanned: 0, sent: 0, pruned: 0, note: 'VAPID not configured' });
  }

  const startedAt = Date.now();
  const now = new Date(startedAt);
  let scanned = 0;
  let sent    = 0;
  let pruned  = 0;

  // ── Scheduled reminders ────────────────────────────────────────────────────
  const subs = await redis.smembers(WEB_PUSH_SUBS_KEY);

  for (const subStr of (subs || [])) {
    scanned++;
    const sub = parseMember(subStr);
    if (!sub?.endpoint) continue;

    const subId = subIdFromEndpoint(sub.endpoint);
    const reminders = await getJson(WEB_REMINDERS_PREFIX + subId);
    if (!reminders || !Array.isArray(reminders.slots) || reminders.slots.length === 0) continue;

    const tzOffset = Number.isFinite(reminders.tzOffsetMinutes) ? reminders.tzOffsetMinutes : 0;
    // localMs = UTC + tzOffsetMinutes (positive = ahead of UTC).
    const localMs   = startedAt + tzOffset * 60_000;
    const local     = new Date(localMs);
    const localHour   = local.getUTCHours();
    const localMinute = local.getUTCMinutes();
    const localWeekday = local.getUTCDay() + 1; // 1=Sun .. 7=Sat (Expo convention)
    const localDateKey = `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2,'0')}-${String(local.getUTCDate()).padStart(2,'0')}`;
    const fireKey      = `${localDateKey} ${String(localHour).padStart(2,'0')}:${String(localMinute).padStart(2,'0')}`;

    if (isInQuietHours(localHour, localMinute, reminders.quietHours)) continue;

    const lastFired = (reminders.lastFired && typeof reminders.lastFired === 'object') ? { ...reminders.lastFired } : {};
    let dirty  = false;
    let killed = false;

    for (const slot of reminders.slots) {
      if (!slot || !Number.isInteger(slot.hour) || !Number.isInteger(slot.minute)) continue;
      if (slot.hour !== localHour || slot.minute !== localMinute) continue;
      if (Array.isArray(slot.weekdays) && slot.weekdays.length > 0 && !slot.weekdays.includes(localWeekday)) continue;
      if (lastFired[slot.id] === fireKey) continue; // already fired this minute

      const r = await sendWebPush(sub, {
        title: slot.title || 'Habit reminder',
        body:  slot.body  || 'Time to build your streak.',
        data:  slot.data  || {},
      }, { ttl: 60, member: subStr });

      if (r.ok) {
        sent++;
        lastFired[slot.id] = fireKey;
        dirty = true;
      } else if (r.pruned) {
        pruned++;
        killed = true;
        break; // sub is dead — no point checking remaining slots
      }
    }

    if (dirty && !killed) {
      await redis.set(WEB_REMINDERS_PREFIX + subId, JSON.stringify({ ...reminders, lastFired }));
    }
  }

  // ── Snooze queue drain ─────────────────────────────────────────────────────
  let dueItems = [];
  try {
    dueItems = await redis.zrange(WEB_SNOOZE_QUEUE_KEY, 0, startedAt, { byScore: true }) || [];
  } catch (e) {
    console.error('[web-tick] snooze zrange failed:', e?.message ?? e);
  }

  for (const item of dueItems) {
    const parsed = parseMember(item);
    if (parsed?.subscription && parsed?.payload) {
      const r = await sendWebPush(parsed.subscription, parsed.payload, { ttl: 60 });
      if (r.ok) sent++;
      else if (r.pruned) pruned++;
    }
    // Always remove — one-shot, no retries (prevents infinite loop on bad data).
    await redis.zrem(WEB_SNOOZE_QUEUE_KEY, item);
  }

  return res.json({ ok: true, scanned, sent, pruned, snoozeDrained: dueItems.length, tookMs: Date.now() - startedAt });
}

app.get('/api/web-tick', requireCronOrAdmin, handleWebTick);

// ── Cosma AI routes (POST /cosma/ai/{chat,rashifal,report}) ──────────────────
mountCosmaAiRoutes(app, { redis });

// ── Core helpers ──────────────────────────────────────────────────────────────

/**
 * Fetch tokens from Redis, build messages, send via Expo in chunks.
 * Also fans out to web-push subscriptions on broadcasts (no `targetTokens`).
 *
 * When `targetTokens` is a non-empty array, only those Expo tokens receive the
 * push and web subscriptions are skipped (selective sends are Expo-only by
 * design — the dashboard targets specific Expo devices).
 *
 * Maps ticket IDs back to tokens so DeviceNotRegistered receipts can prune
 * Redis (Expo).  Web-push pruning is synchronous via 404/410 in `sendWebPush`.
 */
async function sendToAll({ title, body, data, imageUrl = undefined, targetTokens = [], app_id = null }) {
  const isBroadcast = !targetTokens || targetTokens.length === 0;

  // ── Expo branch ──────────────────────────────────────────────────────────
  // Pick the broadcast pool based on app_id. When app_id is null we use the
  // legacy habit_tracker key so existing Habit Tracker crons keep working.
  // When app_id is set we use the per-app set written to by /register.
  const broadcastPool = app_id
    ? `${PUSH_TOKENS_PREFIX}${app_id}`
    : TOKENS_KEY;
  const allTokens = await redis.smembers(broadcastPool);
  const tokenPool = isBroadcast ? allTokens : targetTokens;
  const validTokens = (tokenPool || []).filter(t => Expo.isExpoPushToken(t));
  const messages = validTokens.map(to => ({
    to,
    sound: 'default',
    title,
    body,
    data,
    ...(imageUrl ? { imageUrl } : {}),
  }));

  const tickets = [];
  if (messages.length > 0) {
    const chunks = expo.chunkPushNotifications(messages);
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
  }

  // ── Web Push branch (only on broadcasts) ─────────────────────────────────
  let webSent = 0;
  let webPruned = 0;
  if (isBroadcast && isVapidConfigured()) {
    const webSubs = await redis.smembers(WEB_PUSH_SUBS_KEY);
    const payload = { title, body, data, ...(imageUrl ? { imageUrl } : {}) };
    for (const subStr of (webSubs || [])) {
      const sub = parseMember(subStr);
      if (!sub?.endpoint) continue;
      const r = await sendWebPush(sub, payload, { ttl: 60, member: subStr });
      if (r.ok) webSent++;
      else if (r.pruned) webPruned++;
    }
  }

  return { sent: messages.length, tickets, webSent, webPruned };
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
