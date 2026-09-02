/**
 * Messenger room shell — dual-context Production proof (room ONLY, no gift).
 *
 * A READY → B same room open → B READY
 * then reverse B READY → A open → A READY
 *
 * PLAYWRIGHT_BASE_URL=https://samarket.vercel.app node --env-file=.env.local \
 *   scripts/qa/messenger-room-dual-context-shell-proof.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "https://samarket.vercel.app").replace(/\/$/, "");
const ROOM_ID =
  process.env.MESSENGER_DUAL_ROOM_ID?.trim() || "c202326f-8109-4ce4-aa61-394f0a799e7d";
const OUT = resolve(process.cwd(), "docs/perf/messenger-room-dual-context-shell-proof.json");
const SHOT = resolve(process.cwd(), "docs/perf/messenger-room-dual-context-shell-shots");

const A = {
  email: process.env.GIFT_INSTANT_SENDER_EMAIL?.trim() || "qqqq@manual.local",
  label: "A",
};
const B = {
  email: process.env.GIFT_INSTANT_RECIPIENT_EMAIL?.trim() || "wwww@manual.local",
  label: "B",
};

const SAMPLE_MS = [0, 1000, 2000, 5000, 10000, 20000, 30000, 45000];

function loadEnv() {
  for (const rel of [".env.local", ".env"]) {
    const p = resolve(process.cwd(), rel);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const i = t.indexOf("=");
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

function passwords() {
  return [
    ...new Set(
      [
        process.env.E2E_TEST_PASSWORD,
        process.env.QA_MANUAL_PASSWORD,
        process.env.E2E_ADMIN_PASSWORD,
        "DibayQa1!",
        "1234",
      ].filter(Boolean),
    ),
  ];
}

function sbAnon() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
}

function sbService() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

async function loginSession(email) {
  const sb = sbAnon();
  for (const password of passwords()) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (!error && data.session) return data.session;
  }
  const admin = sbService();
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  let tokenHash = "";
  try {
    const u = new URL(String(link?.properties?.action_link || ""));
    tokenHash = u.searchParams.get("token") || u.searchParams.get("token_hash") || "";
  } catch {
    tokenHash = "";
  }
  if (linkErr || !tokenHash) throw new Error(`login_failed:${email}:${linkErr?.message || "no_token"}`);
  const { data: verified, error: otpErr } = await sb.auth.verifyOtp({
    token_hash: tokenHash,
    type: "email",
  });
  if (otpErr || !verified.session) throw new Error(`otp_failed:${email}:${otpErr?.message}`);
  return verified.session;
}

function playwrightCookies(session) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const ref = new URL(url).hostname.split(".")[0];
  const origin = new URL(ORIGIN);
  return [
    {
      name: `sb-${ref}-auth-token`,
      value: encodeURIComponent(
        JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_at: session.expires_at,
          expires_in: session.expires_in,
          token_type: session.token_type,
          user: session.user,
        }),
      ),
      domain: origin.hostname,
      path: "/",
      expires: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
      httpOnly: false,
      secure: origin.protocol === "https:",
      sameSite: "Lax",
    },
  ];
}

async function probePage(page) {
  return page.evaluate(async () => {
    const body = (document.body?.innerText || "").slice(0, 240);
    const authBoundaryBlocked = Boolean(
      document.querySelector('[data-auth-session-boundary="blocked"]'),
    );
    const roomIdAttr = document.querySelector("[data-cm-room-id]")?.getAttribute("data-cm-room-id");
    const entryEmpty = Boolean(document.querySelector("[data-cm-room-pass1-stable-shell]"));
    const attach = Boolean(
      document.querySelector('[data-cm-composer-attach], textarea, [contenteditable="true"]'),
    );
    let sessionApi = null;
    try {
      const res = await fetch("/api/auth/session", { credentials: "include" });
      const json = await res.json().catch(() => null);
      sessionApi = {
        status: res.status,
        ok: res.ok,
        authenticated: Boolean(json?.authenticated),
      };
    } catch (e) {
      sessionApi = { error: String(e) };
    }
    const loadingOnly = /^Loading[….]?\s*$/i.test(body.trim());
    return {
      url: location.href,
      body,
      authBoundaryBlocked,
      roomIdAttr: roomIdAttr || null,
      entryEmpty,
      attach,
      sessionApi,
      loadingOnly,
    };
  });
}

function classify(sample) {
  if (sample.roomIdAttr && sample.attach && !sample.authBoundaryBlocked && !sample.loadingOnly) {
    return "READY";
  }
  if (sample.authBoundaryBlocked || sample.loadingOnly) return "AUTH_LOADING";
  if (sample.entryEmpty) return "ENTRY_EMPTY";
  if (sample.sessionApi && sample.sessionApi.authenticated === false) return "AUTH_FAIL";
  return "PENDING";
}

async function waitReady(page, label, keepAlivePage) {
  const samples = [];
  const started = Date.now();
  let readyAt = null;
  for (const t of SAMPLE_MS) {
    const wait = Math.max(0, t - (Date.now() - started));
    if (wait > 0) await page.waitForTimeout(wait);
    if (keepAlivePage) {
      await keepAlivePage.evaluate(() => document.visibilityState).catch(() => null);
    }
    const sample = await probePage(page);
    const state = classify(sample);
    samples.push({ t, state, ...sample });
    if (state === "READY" && readyAt == null) {
      readyAt = t;
      break;
    }
  }
  const last = samples[samples.length - 1];
  const ready = last?.state === "READY";
  if (!ready) {
    mkdirSync(SHOT, { recursive: true });
    await page.screenshot({ path: resolve(SHOT, `${label}-hang.png`), fullPage: true }).catch(() => {});
  }
  return { label, ready, readyAtMs: readyAt, samples, final: last };
}

async function openRoom(context, account) {
  const session = await loginSession(account.email);
  await context.addCookies(playwrightCookies(session));
  const page = await context.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${ORIGIN}/community-messenger/rooms/${ROOM_ID}`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  return page;
}

async function main() {
  loadEnv();
  mkdirSync(SHOT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const report = {
    origin: ORIGIN,
    roomId: ROOM_ID,
    aToB: null,
    bToA: null,
    loadingHang: "NOT_PROVEN",
    final: "NOT_PROVEN",
  };

  try {
    {
      const ctxA = await browser.newContext();
      const ctxB = await browser.newContext();
      const pageA = await openRoom(ctxA, A);
      const readyA = await waitReady(pageA, "A-first");
      if (!readyA.ready) {
        report.aToB = { readyA, readyB: null, firstDivergence: "A_NOT_READY" };
        report.loadingHang = "PRESENT";
        report.final = "PARTIAL";
        writeFileSync(OUT, JSON.stringify(report, null, 2));
        process.exitCode = 1;
        return;
      }
      const pageB = await openRoom(ctxB, B);
      const readyB = await waitReady(pageB, "B-while-A", pageA);
      report.aToB = {
        readyA: { ready: true, readyAtMs: readyA.readyAtMs },
        readyB,
        firstDivergence: readyB.ready
          ? "NONE"
          : readyB.final?.state === "AUTH_LOADING" || readyB.final?.loadingOnly
            ? "B_AUTH_LOADING"
            : `B_${readyB.final?.state || "UNKNOWN"}`,
      };
      await ctxA.close();
      await ctxB.close();
    }

    {
      const ctxB = await browser.newContext();
      const ctxA = await browser.newContext();
      const pageB = await openRoom(ctxB, B);
      const readyB = await waitReady(pageB, "B-first");
      if (!readyB.ready) {
        report.bToA = { readyB, readyA: null, firstDivergence: "B_NOT_READY" };
        report.loadingHang = "PRESENT";
        report.final = "PARTIAL";
        writeFileSync(OUT, JSON.stringify(report, null, 2));
        process.exitCode = 1;
        return;
      }
      const pageA = await openRoom(ctxA, A);
      const readyA = await waitReady(pageA, "A-while-B", pageB);
      report.bToA = {
        readyB: { ready: true, readyAtMs: readyB.readyAtMs },
        readyA,
        firstDivergence: readyA.ready
          ? "NONE"
          : readyA.final?.state === "AUTH_LOADING" || readyA.final?.loadingOnly
            ? "A_AUTH_LOADING"
            : `A_${readyA.final?.state || "UNKNOWN"}`,
      };
      await ctxA.close();
      await ctxB.close();
    }

    const aOk = report.aToB?.readyB?.ready === true;
    const bOk = report.bToA?.readyA?.ready === true;
    report.loadingHang = aOk && bOk ? "NONE" : "PRESENT";
    report.final = aOk && bOk ? "PRODUCTION_CLOSED_ROOM_SHELL" : "PARTIAL";
    writeFileSync(OUT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ final: report.final, loadingHang: report.loadingHang, aToB: report.aToB?.firstDivergence, bToA: report.bToA?.firstDivergence }, null, 2));
    process.exitCode = aOk && bOk ? 0 : 1;
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
