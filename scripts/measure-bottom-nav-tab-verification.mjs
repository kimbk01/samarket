/**
 * DIBAY 하단 탭 전환 실측 — 일회성 검증 (앱 코드 수정 없음).
 * 실행: node scripts/measure-bottom-nav-tab-verification.mjs
 * 전제: npm run dev, .env.local Supabase, E2E_TEST_USERNAME/PASSWORD 또는 aaaa@manual.local
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const ORIGIN = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

async function injectSupabaseSession(context, page) {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) return { ok: false, reason: "Supabase env 없음" };
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1] ?? "";
  if (!ref) return { ok: false, reason: "Supabase ref 파싱 실패" };

  const envUser = process.env.E2E_TEST_USERNAME?.trim();
  const envPass = process.env.E2E_TEST_PASSWORD ?? "1234";
  const candidates = envUser
    ? [{ email: envUser.includes("@") ? envUser : `${envUser}@manual.local`, pass: envPass }]
    : [
        { email: "aaaa@manual.local", pass: "1234" },
        { email: "qqqq@manual.local", pass: "1234" },
      ];

  const sb = createClient(url, anon, { auth: { persistSession: false } });
  for (const c of candidates) {
    const { data, error } = await sb.auth.signInWithPassword({ email: c.email, password: c.pass });
    if (error || !data.session) continue;
    const cookieName = `sb-${ref}-auth-token`;
    const payload = JSON.stringify({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
      token_type: "bearer",
      user: data.session.user,
    });
    const origin = new URL(ORIGIN);
    await context.addCookies([
      {
        name: cookieName,
        value: encodeURIComponent(payload),
        domain: origin.hostname,
        path: "/",
        httpOnly: false,
        secure: origin.protocol === "https:",
        sameSite: "Lax",
      },
    ]);
    await page.goto(`${ORIGIN}/philife`, { waitUntil: "domcontentloaded" });
    const probe = await page.request.get(`${ORIGIN}/api/me/settings`);
    if (probe.ok()) return { ok: true, email: c.email };
  }
  return { ok: false, reason: "Supabase signInWithPassword 실패 — E2E 자격 확인" };
}

/** 홈 → 거래 → 커뮤니티 → 배달 → 메신저 → 홈 (admin 5탭 id: community/home/stores/chat) */
const TAB_CYCLE = [
  { label: "홈", href: "/philife", pathRe: /\/philife(\/|$|\?)/, tabIds: ["community"] },
  { label: "거래", href: "/market", pathRe: /\/market/, tabIds: ["home"] },
  { label: "커뮤니티", href: "/philife", pathRe: /\/philife(\/|$|\?)/, tabIds: ["community"] },
  { label: "배달", href: "/stores", pathRe: /\/stores/, tabIds: ["stores"] },
  { label: "메신저", href: "/community-messenger", pathRe: /\/community-messenger/, tabIds: ["chat"] },
  { label: "홈(복귀)", href: "/philife", pathRe: /\/philife(\/|$|\?)/, tabIds: ["community"] },
];

async function waitBottomNavReady(page, timeout = 20_000) {
  await page.waitForFunction(
    () => document.querySelectorAll("a.app-bottom-nav-item").length >= 4,
    undefined,
    { timeout }
  );
}

async function installObservers(page) {
  await page.evaluate(() => {
    window.__TAB_VERIFY__ = {
      handoffSpans: [],
      intentPhases: [],
      thumbSamples: [],
      navPerfIntentLogs: [],
    };

    const origDebug = console.debug.bind(console);
    console.debug = (...args) => {
      try {
        const first = args[0];
        if (first === "[nav-perf]" && args[1]?.phase === "intent_sync") {
          window.__TAB_VERIFY__.intentPhases.push({
            ts: performance.now(),
            ...args[1],
          });
          window.__TAB_VERIFY__.navPerfIntentLogs.push(args[1]);
        }
      } catch {
        /* noop */
      }
      origDebug(...args);
    };

    let handoffVisibleSince = null;
    const obs = new MutationObserver(() => {
      const el = document.querySelector('[data-main-shell-push-handoff="true"]');
      const now = performance.now();
      if (el && handoffVisibleSince == null) {
        handoffVisibleSince = now;
      }
      if (!el && handoffVisibleSince != null) {
        window.__TAB_VERIFY__.handoffSpans.push({
          startPerf: handoffVisibleSince,
          endPerf: now,
          durationMs: Math.round(now - handoffVisibleSince),
        });
        handoffVisibleSince = null;
      }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });

    window.__sampleThumbPulse__ = (label) => {
      const roots = [
        ...document.querySelectorAll("ul"),
        ...document.querySelectorAll('[data-stores-layout-profile="stores-hub"]'),
        ...document.querySelectorAll("[data-community-messenger-home]"),
        ...document.querySelectorAll('[data-cm-home]'),
      ];
      let pulse = 0;
      let imgs = 0;
      let imgsWithPulseSibling = 0;
      for (const root of roots) {
        pulse += root.querySelectorAll(".animate-pulse").length;
        const rootImgs = root.querySelectorAll("img");
        imgs += rootImgs.length;
        for (const img of rootImgs) {
          const frame = img.closest(".relative");
          if (frame?.querySelector(".animate-pulse")) imgsWithPulseSibling += 1;
        }
      }
      window.__TAB_VERIFY__.thumbSamples.push({
        label,
        ts: performance.now(),
        pulseCount: pulse,
        imgCount: imgs,
        thumbFramesWithPulse: imgsWithPulseSibling,
        path: location.pathname,
      });
    };

    window.__pollHandoffAfterRoute__ = async (maxMs = 1600, stepMs = 40) => {
      const samples = [];
      const t0 = performance.now();
      while (performance.now() - t0 < maxMs) {
        const handoff = !!document.querySelector('[data-main-shell-push-handoff="true"]');
        const pushViewport = !!document.querySelector(".main-shell-push-viewport");
        const pendingBlank = !!document.querySelector('[data-community-messenger-home-pending-blank="true"]');
        samples.push({
          elapsedMs: Math.round(performance.now() - t0),
          handoff,
          pushViewport,
          cmPendingBlank: pendingBlank,
        });
        await new Promise((r) => setTimeout(r, stepMs));
      }
      const lastHandoffSpan = window.__TAB_VERIFY__.handoffSpans.at(-1) ?? null;
      return {
        samples,
        handoffStillVisibleAtEnd: samples.at(-1)?.handoff ?? false,
        maxHandoffSpanMs: lastHandoffSpan?.durationMs ?? null,
        handoffSpanCount: window.__TAB_VERIFY__.handoffSpans.length,
      };
    };
  });
}

async function clickBottomNavTab(page, tab) {
  await waitBottomNavReady(page);
  const clickWall = Date.now();
  await page.evaluate(
    ({ href, tabIds }) => {
      let el = null;
      for (const id of tabIds) {
        el = document.querySelector(`a.app-bottom-nav-item[data-bottom-nav-tab-id="${id}"]`);
        if (el) break;
      }
      if (!el) {
        el = [...document.querySelectorAll("a.app-bottom-nav-item")].find((a) => {
          const h = a.getAttribute("href") ?? "";
          return h === href || h.startsWith(`${href}?`) || h.startsWith(`${href}/`);
        });
      }
      if (!el) {
        const available = [...document.querySelectorAll("a.app-bottom-nav-item")].map((a) => ({
          id: a.dataset.bottomNavTabId,
          href: a.getAttribute("href"),
        }));
        throw new Error(`tab not found: ${href} ids=${tabIds.join(",")} available=${JSON.stringify(available)}`);
      }
      el.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
      el.click();
    },
    { href: tab.href, tabIds: tab.tabIds }
  );
  return clickWall;
}

async function waitRoute(page, pathRe, timeout = 60_000) {
  await page.waitForURL(pathRe, { timeout });
  await page.waitForTimeout(120);
}

async function runCycle(page, roundLabel) {
  const rows = [];
  for (const tab of TAB_CYCLE) {
    const from = new URL(page.url()).pathname;
    const navEventCountBefore = await page.evaluate(() => (window.__NAV_PERF_EVENTS ?? []).length);
    const handoffSpanCountBefore = await page.evaluate(() => window.__TAB_VERIFY__?.handoffSpans?.length ?? 0);

    const clickWall = await clickBottomNavTab(page, tab);
    await waitRoute(page, tab.pathRe);

    const handoffPoll = await page.evaluate(() => window.__pollHandoffAfterRoute__?.(1600, 40));
    await page.evaluate((lbl) => window.__sampleThumbPulse__?.(lbl), `${roundLabel}:${tab.label}`);

    const snap = await page.evaluate(
      ({ fromPath, toPath, clickWallMs, navEventCountBefore, handoffSpanCountBefore, handoffPoll }) => {
        const w = window;
        const handoffEl = document.querySelector('[data-main-shell-push-handoff="true"]');
        const pushViewport = document.querySelector(".main-shell-push-viewport");
        const cmPending = document.querySelector('[data-community-messenger-home-pending-blank="true"]');
        const cmHome = document.querySelector("[data-community-messenger-home]");
        const navEvents = w.__NAV_PERF_EVENTS ?? [];
        const newNavEvents = navEvents.slice(navEventCountBefore);
        const lastNav = newNavEvents.length ? newNavEvents[newNavEvents.length - 1] : null;
        const intents = (w.__TAB_VERIFY__?.intentPhases ?? []).filter((i) => {
          const tp = i.toPath ?? "";
          return tp.includes(toPath) || tp.startsWith(toPath);
        });
        const lastIntent = intents.length ? intents[intents.length - 1] : null;
        const newHandoffSpans = (w.__TAB_VERIFY__?.handoffSpans ?? []).slice(handoffSpanCountBefore);
        const lastHandoff = newHandoffSpans.length ? newHandoffSpans[newHandoffSpans.length - 1] : null;
        const thumb = (w.__TAB_VERIFY__?.thumbSamples ?? []).slice(-1)[0] ?? null;
        const handoffAfterRouteSamples = handoffPoll?.samples ?? [];
        const handoffAtRouteArrival =
          handoffAfterRouteSamples.find((s) => s.elapsedMs <= 150)?.handoff ?? null;
        const handoffAt440 =
          handoffAfterRouteSamples.find((s) => s.elapsedMs >= 400 && s.elapsedMs <= 500)?.handoff ?? null;
        const handoffAt1200 =
          handoffAfterRouteSamples.find((s) => s.elapsedMs >= 1150 && s.elapsedMs <= 1250)?.handoff ?? null;
        const handoffAt1600 = handoffPoll?.handoffStillVisibleAtEnd ?? null;
        return {
          fromPath,
          toPath,
          clickWallMs,
          handoffVisibleNow: !!handoffEl,
          pushViewportActive: !!pushViewport,
          cmHomeMounted: !!cmHome,
          cmPendingBlankVisible: !!cmPending,
          lastHandoffDurationMs: lastHandoff?.durationMs ?? null,
          handoffSpanCountThisStep: newHandoffSpans.length,
          clickToIntentMs: lastIntent?.clickToIntentMs ?? lastNav?.clickToIntentMs ?? null,
          intentSyncMs: lastIntent?.intentCommitMs ?? lastNav?.intentSyncMs ?? null,
          routeSettledMs: lastNav?.routeSettledMs ?? null,
          firstShellVisibleMs: lastNav?.firstShellVisibleMs ?? null,
          beginMenuNavigationSeen: lastIntent != null,
          intentToPath: lastIntent?.toPath ?? lastNav?.toPath ?? null,
          thumbPulseCount: thumb?.pulseCount ?? null,
          thumbFramesWithPulse: thumb?.thumbFramesWithPulse ?? null,
          thumbImgCount: thumb?.imgCount ?? null,
          handoffAtRouteArrival,
          handoffAt440,
          handoffAt1200,
          handoffAt1600,
          cmPendingAt1600: handoffAfterRouteSamples.at(-1)?.cmPendingBlank ?? null,
        };
      },
      {
        fromPath: from,
        toPath: new URL(page.url()).pathname,
        clickWallMs: clickWall,
        navEventCountBefore,
        handoffSpanCountBefore,
        handoffPoll,
      }
    );
    rows.push({ round: roundLabel, tab: tab.label, ...snap });
  }
  return rows;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(() => {
    try {
      localStorage.setItem("samarket:debug:navPerf", "1");
      sessionStorage.setItem("samarket:debug:runtime", "1");
    } catch {
      /* noop */
    }
    const hideDevOverlay = () => {
      const style = document.createElement("style");
      style.id = "tab-verify-hide-next-overlay";
      style.textContent =
        "nextjs-portal,[data-nextjs-dev-overlay] { pointer-events: none !important; opacity: 0 !important; visibility: hidden !important; }";
      document.documentElement.appendChild(style);
    };
    if (document.documentElement) hideDevOverlay();
    else document.addEventListener("DOMContentLoaded", hideDevOverlay, { once: true });
  });
  const page = await context.newPage();
  await installObservers(page);

  const login = await injectSupabaseSession(context, page);
  console.log(JSON.stringify({ phase: "login", ...login }, null, 2));
  if (!login.ok) {
    console.error("FAIL: 로그인 불가 — 실측 중단");
    await browser.close();
    process.exit(1);
  }

  try {
    await waitBottomNavReady(page, 25_000);
    await installObservers(page);
  } catch {
    console.error("FAIL: 하단 네비 없음 — URL=", page.url());
    await browser.close();
    process.exit(1);
  }

  await page.waitForTimeout(800);

  const coldRows = await runCycle(page, "cold-1");
  await page.waitForTimeout(2000);

  const warmRows1 = await runCycle(page, "warm-1");
  await page.waitForTimeout(1500);

  const warmRows2 = await runCycle(page, "warm-2");

  const navEvents = await page.evaluate(() => JSON.parse(JSON.stringify(window.__NAV_PERF_EVENTS ?? [])));
  const verify = await page.evaluate(() => JSON.parse(JSON.stringify(window.__TAB_VERIFY__ ?? {})));

  const report = {
    login,
    coldRows,
    warmRows1,
    warmRows2,
    navEvents,
    verify,
    generatedAt: new Date().toISOString(),
  };

  console.log("\n=== TAB_VERIFY_JSON ===");
  console.log(JSON.stringify(report, null, 2));
  console.log("=== END ===\n");

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
