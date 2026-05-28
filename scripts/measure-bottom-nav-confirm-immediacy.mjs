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

const BASE_URL = process.env.BASE_URL?.trim() || "http://localhost:3000";
const LOGIN_ID = process.env.E2E_TEST_USERNAME?.trim() || "aaaa";
const LOGIN_PASSWORD = process.env.E2E_TEST_PASSWORD ?? "1234";
const RUNS = Number(process.env.BN6_RUNS ?? 3);
const LOGIN_IDS = Array.from(
  new Set(
    [LOGIN_ID, "aa11", "aaaa", "qqqq", "aaaa@manual.local"]
      .map((v) => String(v ?? "").trim())
      .filter(Boolean)
  )
);

function nowIso() {
  return new Date().toISOString();
}

async function ensureLoggedInAtStores(page) {
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
      break;
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

  // Some sessions land on non-login shells (e.g., /philife) while already authenticated.
  await page.goto(`${BASE_URL}/stores`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  if (!page.url().includes("/login")) return;
  await page.waitForTimeout(250);
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
  await page.goto(`${BASE_URL}/stores`, { waitUntil: "domcontentloaded", timeout: 90_000 });
}

function pickLatestPhilifeEvent(events) {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const ev = events[i];
    const to = String(ev?.toPath ?? ev?.to ?? ev?.href ?? "");
    if (to.includes("/philife")) return ev;
  }
  return null;
}

async function runOne(page, index) {
  await page.goto(`${BASE_URL}/stores?bn6_run=${index}_${Date.now()}`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
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

  const philifeTab = page
    .locator('[data-bottom-nav-tab-id="community"], a.app-bottom-nav-item[href="/philife"]')
    .first();
  try {
    await philifeTab.waitFor({ state: "visible", timeout: 20_000 });
  } catch (error) {
    const debug = await page.evaluate(() => ({
      url: window.location.href,
      body: String(document.body?.innerText ?? "").slice(0, 500),
      links: Array.from(document.querySelectorAll("a,button"))
        .slice(0, 40)
        .map((el) => ({
          text: (el.textContent ?? "").trim().slice(0, 80),
          href: el instanceof HTMLAnchorElement ? el.getAttribute("href") : null,
          cls: el.getAttribute("class"),
          tabId: el.getAttribute("data-bottom-nav-tab-id"),
        })),
    }));
    throw new Error(`philife tab not visible: ${JSON.stringify(debug)}`, { cause: error });
  }
  await philifeTab.click();

  const confirmDialog = page
    .getByRole("dialog")
    .filter({ has: page.locator("#main-bottom-nav-cross-domain-title") })
    .first();
  const confirmBtn = confirmDialog.getByRole("button", { name: /확인|Confirm/i }).first();
  await confirmBtn.waitFor({ state: "visible", timeout: 15_000 });
  const tConfirm = await page.evaluate(() => performance.now());
  await confirmBtn.click();

  let tPushExit = null;
  try {
    await page.waitForSelector(
      "[data-main-shell-push-surface].main-shell-push-surface-exit-ltr, [data-main-shell-push-surface].main-shell-push-surface-exit-rtl, .main-shell-push-track--animate, [data-main-shell-push-surface].main-shell-push-surface-enter-ltr, [data-main-shell-push-surface].main-shell-push-surface-enter-rtl",
      { timeout: 500 }
    );
    tPushExit = await page.evaluate(() => performance.now());
  } catch {
    tPushExit = null;
  }

  const pushSurfaceClass = await page.evaluate(() => {
    const el = document.querySelector("[data-main-shell-push-surface]");
    return el instanceof HTMLElement ? el.className : "";
  });

  let tPathChanged = null;
  let pathChangeDebug = null;
  try {
    await page.waitForFunction(() => window.location.pathname.startsWith("/philife"), { timeout: 30_000 });
    tPathChanged = await page.evaluate(() => performance.now());
  } catch {
    pathChangeDebug = await page.evaluate(() => ({
      url: window.location.href,
      pathname: window.location.pathname,
      surfaceClass:
        document.querySelector("[data-main-shell-push-surface]") instanceof HTMLElement
          ? document.querySelector("[data-main-shell-push-surface]")?.className
          : null,
      pushTrackClass:
        document.querySelector(".main-shell-push-track") instanceof HTMLElement
          ? document.querySelector(".main-shell-push-track")?.className
          : null,
      pushAxis:
        document.querySelector("[data-route-push-axis]") instanceof HTMLElement
          ? document.querySelector("[data-route-push-axis]")?.getAttribute("data-route-push-axis")
          : null,
      dialogVisible: !!document.querySelector('[role="dialog"]'),
      body: String(document.body?.innerText ?? "").slice(0, 500),
    }));
  }

  let tPush = null;
  try {
    await page.waitForSelector(
      "[data-main-shell-push-surface].main-shell-push-surface-enter-ltr, [data-main-shell-push-surface].main-shell-push-surface-enter-rtl, .main-shell-push-track--animate",
      { timeout: 2_000 }
    );
    tPush = await page.evaluate(() => performance.now());
  } catch {
    tPush = null;
  }

  await page.waitForLoadState("domcontentloaded", { timeout: 30_000 });
  await page.waitForTimeout(1800);

  const navPerfEvents = await page.evaluate(() => {
    const w = window;
    return {
      nav: JSON.parse(JSON.stringify(w.__NAV_PERF_EVENTS ?? [])),
      confirm: JSON.parse(JSON.stringify(w.__SAMARKET_CONFIRM_NAV_EVENTS ?? [])),
    };
  });
  const latestPhilife = pickLatestPhilifeEvent(navPerfEvents.nav);
  const dialogStillVisible = await confirmDialog.isVisible().catch(() => false);
  const lastConfirm = (navPerfEvents.confirm ?? []).at(-1) ?? null;

  return {
    run: index,
    push_surface_class_after_confirm: pushSurfaceClass,
    confirm_dialog_still_visible: dialogStillVisible,
    confirm_to_push_exit_ms: tPushExit == null ? null : Math.round(tPushExit - tConfirm),
    confirm_to_push_track_ms: tPush == null ? null : Math.round(tPush - tConfirm),
    confirm_to_path_change_ms: tPathChanged == null ? null : Math.round(tPathChanged - tConfirm),
    path_change_debug: pathChangeDebug,
    confirm_to_commit_ms: lastConfirm?.confirm_to_commit_ms ?? null,
    nav_event: latestPhilife,
    nav_events_count: (navPerfEvents.nav ?? []).length,
    confirm_events_count: (navPerfEvents.confirm ?? []).length,
  };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addInitScript(() => {
    try {
      sessionStorage.setItem("samarket:debug:runtime", "1");
      window.localStorage.setItem("samarket:debug:navPerf", "1");
    } catch {
      // ignore
    }
  });

  const rows = [];
  const bootstrapPage = await context.newPage();
  await ensureLoggedInAtStores(bootstrapPage);
  await bootstrapPage.close();

  for (let i = 1; i <= RUNS; i += 1) {
    const page = await context.newPage();
    await ensureLoggedInAtStores(page);
    rows.push(await runOne(page, i));
    await page.close();
  }

  await browser.close();

  const compact = rows.map((r) => ({
    run: r.run,
    push_surface_class_after_confirm: r.push_surface_class_after_confirm,
    confirm_dialog_still_visible: r.confirm_dialog_still_visible,
    nav_events_count: r.nav_events_count,
    confirm_events_count: r.confirm_events_count,
    confirm_to_commit_ms: r.confirm_to_commit_ms,
    confirm_to_push_exit_ms: r.confirm_to_push_exit_ms,
    confirm_to_push_track_ms: r.confirm_to_push_track_ms,
    confirm_to_path_change_ms: r.confirm_to_path_change_ms,
    path_change_debug: r.path_change_debug,
    routeSettledMs: r.nav_event?.routeSettledMs ?? null,
    firstShellVisibleMs: r.nav_event?.firstShellVisibleMs ?? null,
    slowestApiMs: r.nav_event?.slowestApiMs ?? null,
    toPath: r.nav_event?.toPath ?? null,
  }));

  console.log(
    JSON.stringify(
      {
        tag: "bn6_confirm_immediacy",
        at: nowIso(),
        baseUrl: BASE_URL,
        loginId: LOGIN_ID,
        runs: compact,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error("[bn6_confirm_immediacy] failed:", err);
  process.exit(1);
});
