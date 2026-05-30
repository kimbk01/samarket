/**
 * Bottom nav navigation measurement.
 *
 * Default (Phase A): `BN6_MODE=phase-a-safe-nav` — read-only hub 이동에 Confirm 없음·즉시 commit.
 * Legacy: `BN6_MODE=legacy-confirm-immediacy` — pre-Phase-A Confirm dialog 대기(회귀 비교용).
 *
 * Usage:
 *   node scripts/measure-bottom-nav-confirm-immediacy.mjs
 *   BN6_MODE=legacy-confirm-immediacy node scripts/measure-bottom-nav-confirm-immediacy.mjs
 */
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  for (const name of [".env.local", ".env"]) {
    const p = resolve(process.cwd(), name);
    if (!existsSync(p)) continue;
    const raw = readFileSync(p, "utf8");
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i === -1) continue;
      const key = t.slice(0, i).trim();
      if (process.env[key] != null) continue;
      let value = t.slice(i + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}

loadEnvLocal();

const BASE_URL = process.env.BASE_URL?.trim() || "http://127.0.0.1:3000";
const LOGIN_ID = process.env.E2E_TEST_USERNAME?.trim() || "aaaa";
const LOGIN_PASSWORD = process.env.E2E_TEST_PASSWORD ?? "1234";
const RUNS = Number(process.env.BN6_RUNS ?? 1);
const BN6_MODE = (process.env.BN6_MODE ?? "phase-a-safe-nav").trim();
const LOGIN_IDS = Array.from(
  new Set(
    [LOGIN_ID, "aa11", "aaaa", "qqqq", "aaaa@manual.local"]
      .map((v) => String(v ?? "").trim())
      .filter(Boolean)
  )
);

/** Phase A read-only safe navigation — BottomNav mobile only */
const PHASE_A_SAFE_NAV_SCENARIOS = [
  { label: "philife->trade", fromPath: "/philife", tabId: "home", destinationPrefix: "/market" },
  { label: "philife->delivery", fromPath: "/philife", tabId: "stores", destinationPrefix: "/stores" },
  {
    label: "philife->messenger",
    fromPath: "/philife",
    tabId: "chat",
    destinationPrefix: "/community-messenger",
  },
  { label: "market->community", fromPath: "/market", tabId: "community", destinationPrefix: "/philife" },
  { label: "stores->community", fromPath: "/stores", tabId: "community", destinationPrefix: "/philife" },
  { label: "mypage->trade", fromPath: "/mypage", tabId: "home", destinationPrefix: "/market" },
  { label: "mypage->community", fromPath: "/mypage", tabId: "community", destinationPrefix: "/philife" },
];

function nowIso() {
  return new Date().toISOString();
}

async function ensureLoggedIn(page) {
  const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const sbAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
  const ref = sbUrl.match(/https:\/\/([^.]+)\./)?.[1] ?? null;
  const host = new URL(BASE_URL).hostname;
  if (sbUrl && sbAnon && ref) {
    const sb = createClient(sbUrl, sbAnon, { auth: { persistSession: false } });
    for (const loginId of LOGIN_IDS) {
      const email = loginId.includes("@") ? loginId.toLowerCase() : `${loginId.toLowerCase()}@manual.local`;
      const { data, error } = await sb.auth.signInWithPassword({ email, password: LOGIN_PASSWORD });
      if (error || !data.session) continue;
      const session = {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
        expires_in: data.session.expires_in,
        token_type: data.session.token_type,
        user: data.session.user,
      };
      await page.context().addCookies([
        {
          name: `sb-${ref}-auth-token`,
          value: encodeURIComponent(JSON.stringify(session)),
          domain: host,
          path: "/",
          httpOnly: false,
          secure: false,
          sameSite: "Lax",
        },
      ]);
      return;
    }
  }

  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.evaluate(
    async ({ username, password }) => {
      try {
        const r = await fetch("/api/test-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ username, password }),
        });
        const data = await r.json().catch(() => null);
        if (!r.ok || !data?.ok || !data?.userId) return;
        sessionStorage.setItem("test_user_id", data.userId);
        sessionStorage.setItem("test_username", data.username ?? username);
        sessionStorage.setItem("test_role", data.role || "member");
        document.cookie = `kasama_dev_uid_pub=${encodeURIComponent(data.userId)}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
        window.dispatchEvent(new Event("kasama-test-auth-changed"));
      } catch {
        // ignore
      }
    },
    { username: LOGIN_ID, password: LOGIN_PASSWORD }
  );

  await page.goto(`${BASE_URL}/stores`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  if (!page.url().includes("/login")) return;

  const userInput = page.locator('input[type="text"], input[type="email"]').first();
  const passInput = page.locator('input[type="password"]').first();
  await userInput.waitFor({ state: "visible", timeout: 20_000 });

  let ok = false;
  for (const id of LOGIN_IDS) {
    await userInput.fill("");
    await passInput.fill("");
    await userInput.fill(id);
    await passInput.fill(LOGIN_PASSWORD);
    await page.getByRole("button", { name: /로그인|Sign in/i }).first().click();
    try {
      await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 12_000 });
      ok = true;
      break;
    } catch {
      // try next identifier
    }
  }
  if (!ok) {
    const body = await page.locator("body").innerText();
    throw new Error(`login failed at ${page.url()} | snippet=${body.slice(0, 400)}`);
  }
}

async function resetNavPerf(page) {
  await page.evaluate(() => {
    try {
      window.localStorage.setItem("samarket:debug:navPerf", "1");
      sessionStorage.setItem("samarket:debug:runtime", "1");
      window.__NAV_PERF_EVENTS = [];
      window.__SAMARKET_CONFIRM_NAV_EVENTS = [];
    } catch {
      // ignore
    }
  });
}

async function readBottomNavConfirmVisible(page) {
  return page.evaluate(() => {
    const cross = document.querySelector("#main-bottom-nav-cross-domain-title");
    const dialog = cross?.closest('[role="dialog"]');
    const visible =
      cross instanceof HTMLElement &&
      dialog instanceof HTMLElement &&
      dialog.offsetParent !== null &&
      getComputedStyle(dialog).visibility !== "hidden" &&
      getComputedStyle(dialog).display !== "none";
    return {
      confirmShown: visible,
      dialogTitle: cross instanceof HTMLElement ? cross.textContent?.trim() ?? null : null,
    };
  });
}

function pickNavEventForDestination(navEvents, destinationPrefix) {
  for (let i = navEvents.length - 1; i >= 0; i -= 1) {
    const ev = navEvents[i];
    const to = String(ev?.toPath ?? "");
    if (to.startsWith(destinationPrefix)) return ev;
  }
  return navEvents.at(-1) ?? null;
}

function evaluatePhaseASafePass(row) {
  const failures = [];
  if (row.confirmShown) failures.push("confirm_dialog_visible");
  if ((row.confirm_events_count ?? 0) > 0) failures.push("confirm_to_commit_events");
  if (row.confirm_to_commit_ms != null) failures.push("confirm_to_commit_ms_logged");
  if (!row.pathnameAfter?.startsWith(row.destinationPrefix)) {
    failures.push(`route_not_reached(expected=${row.destinationPrefix}, actual=${row.pathnameAfter})`);
  }

  const warnings = [];
  if ((row.nav_events_count ?? 0) === 0) {
    warnings.push("nav_perf_not_recorded");
  } else {
    if (row.clickToIntentMs == null) warnings.push("clickToIntentMs_missing");
    if (row.routeSettledMs == null) warnings.push("routeSettledMs_missing");
  }

  return {
    pass: failures.length === 0,
    confirm_gate_pass: failures.length === 0,
    failures,
    warnings,
  };
}

/**
 * Phase A — read-only: Confirm 없이 즉시 commit.
 */
async function runPhaseASafeNavCase(page, scenario, runIndex) {
  await page.goto(`${BASE_URL}${scenario.fromPath}?bn6_run=${runIndex}_${Date.now()}`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await resetNavPerf(page);
  await page.waitForSelector(".app-bottom-nav-shell", { timeout: 30_000 });
  await page.waitForTimeout(1200);

  const tab = page.locator(`[data-bottom-nav-tab-id="${scenario.tabId}"]`).first();
  try {
    await tab.waitFor({ state: "visible", timeout: 20_000 });
  } catch (error) {
    const debug = await page.evaluate(() => ({
      url: window.location.href,
      tabs: Array.from(document.querySelectorAll("[data-bottom-nav-tab-id]")).map((el) =>
        el.getAttribute("data-bottom-nav-tab-id")
      ),
      body: String(document.body?.innerText ?? "").slice(0, 300),
    }));
    throw new Error(`tab not visible (${scenario.tabId}): ${JSON.stringify(debug)}`, { cause: error });
  }

  await tab.click();

  // Phase A: Confirm must NOT appear — short poll only (no 15s wait-for-dialog)
  await page.waitForTimeout(400);
  const confirmImmediate = await readBottomNavConfirmVisible(page);

  let pathnameAfter = scenario.fromPath;
  try {
    await page.waitForFunction(
      (prefix) => window.location.pathname.startsWith(prefix),
      scenario.destinationPrefix,
      { timeout: 30_000 }
    );
    pathnameAfter = await page.evaluate(() => window.location.pathname);
  } catch {
    pathnameAfter = await page.evaluate(() => window.location.pathname);
  }

  // nav-perf route_settled + 1500ms API sample window
  await page
    .waitForFunction(() => (window.__NAV_PERF_EVENTS ?? []).length > 0, { timeout: 8_000 })
    .catch(() => null);
  await page.waitForTimeout(1800);

  const perf = await page.evaluate(() => ({
    nav: JSON.parse(JSON.stringify(window.__NAV_PERF_EVENTS ?? [])),
    confirm: JSON.parse(JSON.stringify(window.__SAMARKET_CONFIRM_NAV_EVENTS ?? [])),
    pathname: window.location.pathname,
  }));

  const confirmLate = await readBottomNavConfirmVisible(page);
  const navEvent = pickNavEventForDestination(perf.nav, scenario.destinationPrefix);
  const lastConfirm = perf.confirm.at(-1) ?? null;

  const row = {
    mode: "phase-a-safe-nav",
    run: runIndex,
    label: scenario.label,
    fromPath: scenario.fromPath,
    tabId: scenario.tabId,
    destinationPrefix: scenario.destinationPrefix,
    confirmShown: confirmImmediate.confirmShown || confirmLate.confirmShown,
    confirm_dialog_title: confirmImmediate.dialogTitle ?? confirmLate.dialogTitle,
    confirm_events_count: perf.confirm.length,
    confirm_to_commit_ms: lastConfirm?.confirm_to_commit_ms ?? null,
    pathnameAfter: perf.pathname ?? pathnameAfter,
    clickToIntentMs: navEvent?.clickToIntentMs ?? null,
    firstShellVisibleMs: navEvent?.firstShellVisibleMs ?? null,
    routeSettledMs: navEvent?.routeSettledMs ?? null,
    toPath: navEvent?.toPath ?? null,
    nav_events_count: perf.nav.length,
  };

  const verdict = evaluatePhaseASafePass(row);
  return {
    ...row,
    pass: verdict.pass,
    confirm_gate_pass: verdict.confirm_gate_pass,
    failures: verdict.failures,
    warnings: verdict.warnings,
  };
}

function pickLatestPhilifeEvent(events) {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const ev = events[i];
    const to = String(ev?.toPath ?? ev?.to ?? ev?.href ?? "");
    if (to.includes("/philife")) return ev;
  }
  return null;
}

/**
 * Legacy — pre-Phase-A: stores → philife with Confirm dialog wait.
 */
async function runLegacyConfirmImmediacy(page, index) {
  await page.goto(`${BASE_URL}/stores?bn6_run=${index}_${Date.now()}`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await resetNavPerf(page);

  const philifeTab = page
    .locator('[data-bottom-nav-tab-id="community"], a.app-bottom-nav-item[href="/philife"]')
    .first();
  await philifeTab.waitFor({ state: "visible", timeout: 20_000 });
  await philifeTab.click();

  const confirmDialog = page
    .getByRole("dialog")
    .filter({ has: page.locator("#main-bottom-nav-cross-domain-title") })
    .first();
  const confirmBtn = confirmDialog.getByRole("button", { name: /확인|Confirm/i }).first();
  await confirmBtn.waitFor({ state: "visible", timeout: 15_000 });
  const tConfirm = await page.evaluate(() => performance.now());
  await confirmBtn.click();

  await page.waitForFunction(() => window.location.pathname.startsWith("/philife"), { timeout: 30_000 });
  await page.waitForTimeout(1800);

  const navPerfEvents = await page.evaluate(() => ({
    nav: JSON.parse(JSON.stringify(window.__NAV_PERF_EVENTS ?? [])),
    confirm: JSON.parse(JSON.stringify(window.__SAMARKET_CONFIRM_NAV_EVENTS ?? [])),
  }));
  const latestPhilife = pickLatestPhilifeEvent(navPerfEvents.nav);
  const lastConfirm = (navPerfEvents.confirm ?? []).at(-1) ?? null;
  const tPathChanged = await page.evaluate(() => performance.now());

  return {
    mode: "legacy-confirm-immediacy",
    run: index,
    label: "stores->philife(legacy)",
    confirmShown: true,
    confirm_to_commit_ms: lastConfirm?.confirm_to_commit_ms ?? null,
    confirm_to_path_change_ms: Math.round(tPathChanged - tConfirm),
    nav_event: latestPhilife,
    nav_events_count: (navPerfEvents.nav ?? []).length,
    confirm_events_count: (navPerfEvents.confirm ?? []).length,
    pass: lastConfirm?.confirm_to_commit_ms != null,
  };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await context.addInitScript(() => {
    try {
      sessionStorage.setItem("samarket:debug:runtime", "1");
      window.localStorage.setItem("samarket:debug:navPerf", "1");
    } catch {
      // ignore
    }
  });

  const bootstrapPage = await context.newPage();
  await ensureLoggedIn(bootstrapPage);
  await bootstrapPage.close();

  const rows = [];

  if (BN6_MODE === "legacy-confirm-immediacy") {
    for (let i = 1; i <= RUNS; i += 1) {
      const page = await context.newPage();
      await ensureLoggedIn(page);
      rows.push(await runLegacyConfirmImmediacy(page, i));
      await page.close();
    }
  } else {
    for (let run = 1; run <= RUNS; run += 1) {
      for (const scenario of PHASE_A_SAFE_NAV_SCENARIOS) {
        const page = await context.newPage();
        await ensureLoggedIn(page);
        rows.push(await runPhaseASafeNavCase(page, scenario, run));
        await page.close();
      }
    }
  }

  await browser.close();

  const allPass = rows.every((r) => r.pass === true);
  const confirmGatePass = rows.every((r) => r.confirm_gate_pass === true);
  const tag = BN6_MODE === "legacy-confirm-immediacy" ? "bn6_legacy_confirm_immediacy" : "bn6_phase_a_safe_nav";

  console.log(
    JSON.stringify(
      {
        tag,
        mode: BN6_MODE,
        at: nowIso(),
        baseUrl: BASE_URL,
        loginId: LOGIN_ID,
        runs: rows,
        summary: {
          total: rows.length,
          passed: rows.filter((r) => r.pass).length,
          failed: rows.filter((r) => !r.pass).length,
          confirm_gate_passed: rows.filter((r) => r.confirm_gate_pass).length,
          nav_perf_warnings: rows.filter((r) => (r.warnings ?? []).length > 0).length,
          allPass,
          confirmGatePass,
        },
      },
      null,
      2
    )
  );

  if (!allPass) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`[${BN6_MODE}] failed:`, err);
  process.exit(1);
});
