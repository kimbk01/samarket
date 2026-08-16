/**
 * Hub NEW-only cover-enter runtime check.
 *
 * Community→Trade repeats:
 *   PLAYWRIGHT_BASE_URL=… NEW_ONLY_REPEATS=5 node scripts/measure-bottom-nav-new-only-enter.mjs
 *
 * 5 MAIN one session:
 *   PLAYWRIGHT_BASE_URL=… NEW_ONLY_FIVE_MAIN=1 node scripts/measure-bottom-nav-new-only-enter.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3001").replace(/\/$/, "");
const OUT = path.join(process.cwd(), ".qa-logs/bottom-nav-new-only-enter");
const REPEATS = Number(process.env.NEW_ONLY_REPEATS || 5);
const FIVE_MAIN = process.env.NEW_ONLY_FIVE_MAIN === "1";

const FIVE_HOPS = [
  { label: "Community→Trade", hrefExact: "/market", hrefIncludes: null, destPrefix: "/market" },
  { label: "Trade→Delivery", hrefExact: "/stores", hrefIncludes: null, destPrefix: "/stores" },
  {
    label: "Delivery→Chat",
    hrefExact: null,
    hrefIncludes: "/community-messenger",
    destPrefix: "/community-messenger",
  },
  { label: "Chat→MyPage", hrefExact: "/mypage", hrefIncludes: null, destPrefix: "/mypage" },
  { label: "MyPage→Community", hrefExact: "/philife", hrefIncludes: null, destPrefix: "/philife" },
];

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
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

async function injectAuth(context) {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) return { ok: false, reason: "no env" };
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1] ?? "";
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({
    email: "qqqq@manual.local",
    password: "1234",
  });
  if (error || !data.session) return { ok: false, reason: error?.message || "auth fail" };
  const origin = new URL(ORIGIN);
  await context.addCookies([
    {
      name: `sb-${ref}-auth-token`,
      value: encodeURIComponent(
        JSON.stringify({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_at: data.session.expires_at,
          token_type: "bearer",
          user: data.session.user,
        })
      ),
      domain: origin.hostname,
      path: "/",
      httpOnly: false,
      secure: origin.protocol === "https:",
      sameSite: "Lax",
    },
  ]);
  return { ok: true };
}

function navLocator(page, hop) {
  if (hop.hrefExact) {
    return page.locator(`a.app-bottom-nav-item[href="${hop.hrefExact}"]`).first();
  }
  return page.locator(`a.app-bottom-nav-item[href*="${hop.hrefIncludes}"]`).first();
}

function pathOk(pathName, prefix) {
  return pathName === prefix || pathName.startsWith(`${prefix}/`);
}

async function sampleAfterClick(page) {
  let maxTx = 0;
  let sawCoverKind = false;
  let sawFrozenOverlay = false;
  for (let s = 0; s < 35; s++) {
    const snap = await page.evaluate(() => {
      const surface = document.querySelector("[data-main-shell-push-surface]");
      const frozen = document.querySelector("[data-main-shell-cover-bg]");
      const t = surface ? getComputedStyle(surface).transform : "none";
      let tx = 0;
      const m = t && t !== "none" ? t.match(/matrix\(([^)]+)\)/) : null;
      if (m) tx = Number(m[1].split(",")[4]) || 0;
      return {
        path: location.pathname,
        kind: surface?.dataset?.routeTransitionKind || null,
        tx,
        frozen: Boolean(frozen),
      };
    });
    maxTx = Math.max(maxTx, Math.abs(snap.tx));
    if (snap.kind === "cover") sawCoverKind = true;
    if (snap.frozen) sawFrozenOverlay = true;
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(400);
  const idle = await page.evaluate(() => {
    const surface = document.querySelector("[data-main-shell-push-surface]");
    const frozen = document.querySelector("[data-main-shell-cover-bg]");
    const t = surface ? getComputedStyle(surface).transform : "none";
    return {
      path: location.pathname,
      kind: surface?.dataset?.routeTransitionKind || null,
      transform: t,
      frozen: Boolean(frozen),
    };
  });
  return { maxTx, sawCoverKind, sawFrozenOverlay, idle };
}

async function oneCommunityToTrade(browser, i) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
  });
  const auth = await injectAuth(context);
  if (!auth.ok) {
    await context.close();
    return { i, pass: false, auth };
  }
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/philife`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForSelector('a.app-bottom-nav-item[href="/market"]', { timeout: 30_000 });
  await page.waitForTimeout(2500);
  await page
    .waitForFunction(
      () =>
        Boolean(
          document
            .querySelector('a.app-bottom-nav-item[href="/market"]')
            ?.getAttribute("data-bottom-nav-tab-id")
        ),
      { timeout: 20_000 }
    )
    .catch(() => null);

  await page.locator('a.app-bottom-nav-item[href="/market"]').first().click({ timeout: 10_000 });
  const sampled = await sampleAfterClick(page);
  const navigated = pathOk(sampled.idle.path, "/market");
  const motion = sampled.maxTx > 40;
  const idleClean =
    !sampled.idle.frozen &&
    (sampled.idle.kind === "none" || sampled.idle.kind == null) &&
    (sampled.idle.transform === "none" || sampled.idle.transform?.includes("matrix(1, 0, 0, 1"));
  const pass =
    navigated && motion && sampled.sawCoverKind && !sampled.sawFrozenOverlay && idleClean;
  await context.close();
  return { i, pass, navigated, motion, ...sampled };
}

async function fiveMain(browser) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
  });
  const auth = await injectAuth(context);
  if (!auth.ok) {
    await context.close();
    return { pass: false, auth, hops: [] };
  }
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/philife`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForSelector('a.app-bottom-nav-item[href="/market"]', { timeout: 30_000 });
  await page.waitForTimeout(2500);

  const hops = [];
  for (const hop of FIVE_HOPS) {
    await navLocator(page, hop).click({ timeout: 15_000 });
    const sampled = await sampleAfterClick(page);
    const navigated = pathOk(sampled.idle.path || "", hop.destPrefix);
    const motion = sampled.maxTx > 40;
    const idleClean =
      !sampled.idle.frozen &&
      (sampled.idle.kind === "none" || sampled.idle.kind == null) &&
      (sampled.idle.transform === "none" ||
        sampled.idle.transform?.includes("matrix(1, 0, 0, 1"));
    const pass =
      navigated && motion && sampled.sawCoverKind && !sampled.sawFrozenOverlay && idleClean;
    const row = { label: hop.label, pass, navigated, motion, idleClean, ...sampled };
    hops.push(row);
    console.log(JSON.stringify(row));
    if (!pass) break;
    await page.waitForTimeout(400);
  }
  await context.close();
  return {
    pass: hops.length === FIVE_HOPS.length && hops.every((h) => h.pass),
    hops,
  };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });

  if (FIVE_MAIN) {
    const five = await fiveMain(browser);
    await browser.close();
    const report = { mode: "five_main", origin: ORIGIN, ...five };
    fs.writeFileSync(path.join(OUT, "FIVE-MAIN.json"), JSON.stringify(report, null, 2));
    console.log(`5 MAIN NEW-ONLY: ${five.pass ? "PASS" : "FAIL"}`);
    process.exit(five.pass ? 0 : 1);
  }

  const runs = [];
  for (let i = 0; i < REPEATS; i++) {
    const r = await oneCommunityToTrade(browser, i);
    runs.push(r);
    console.log(JSON.stringify(r));
  }
  await browser.close();
  const ok = runs.filter((r) => r.pass).length;
  const report = {
    mode: "community_to_trade",
    origin: ORIGIN,
    repeats: REPEATS,
    passCount: ok,
    failCount: REPEATS - ok,
    verdict: ok === REPEATS ? "PASS" : "FAIL",
    runs,
  };
  fs.writeFileSync(path.join(OUT, "REPORT.json"), JSON.stringify(report, null, 2));
  console.log(`COMMUNITY→TRADE NEW-ONLY: ${report.verdict} (${ok}/${REPEATS})`);
  process.exit(ok === REPEATS ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
