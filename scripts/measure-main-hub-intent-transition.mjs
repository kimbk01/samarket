/**
 * MAIN hub intent transition runtime measure.
 *
 * Metrics authority:
 *   tap → transition_first_frame
 *   tap → pathname_commit
 *   tap → destination_settled
 *
 * Also proves Header/Body lockstep (same transform) and BottomNav tx=0.
 *
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:3001 node scripts/measure-main-hub-intent-transition.mjs
 *   PLAYWRIGHT_BASE_URL=… MAIN_HUB_FIVE_MAIN=1 node scripts/measure-main-hub-intent-transition.mjs
 *   PLAYWRIGHT_BASE_URL=… MAIN_HUB_IDLE_MS=45000 node scripts/measure-main-hub-intent-transition.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3001").replace(/\/$/, "");
const OUT = path.join(process.cwd(), ".qa-logs/main-hub-intent-transition");
const FIVE_MAIN = process.env.MAIN_HUB_FIVE_MAIN === "1";
const IDLE_MS = Number(process.env.MAIN_HUB_IDLE_MS || 0);
const COLD_WARM = process.env.MAIN_HUB_COLD_WARM === "1";

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

function parseTx(transform) {
  if (!transform || transform === "none") return 0;
  const m = transform.match(/matrix\(([^)]+)\)/);
  if (!m) return 0;
  return Number(m[1].split(",")[4]) || 0;
}

async function installTapProbe(page) {
  await page.evaluate(() => {
    window.__mainHubTapProbe = {
      tapAt: 0,
      firstFrameAt: 0,
      pathnameAt: 0,
      settledAt: 0,
      frames: [],
      kindSeen: null,
      frozenSeen: false,
    };
    const probe = window.__mainHubTapProbe;
    const read = () => {
      const surface = document.querySelector("[data-main-shell-push-surface]");
      const header =
        document.querySelector("[data-app-sticky-header]") ||
        document.querySelector(".main-hub-scroll-header");
      const body = document.querySelector("[data-main-hub-scroll-body]");
      const nav = document.querySelector("[data-app-bottom-nav], .app-bottom-nav-shell, nav.app-bottom-nav");
      const st = surface ? getComputedStyle(surface).transform : "none";
      const ht = header ? getComputedStyle(header).transform : "none";
      const bt = body ? getComputedStyle(body).transform : "none";
      const nt = nav ? getComputedStyle(nav).transform : "none";
      const parse = (t) => {
        if (!t || t === "none") return 0;
        const m = t.match(/matrix\(([^)]+)\)/);
        return m ? Number(m[1].split(",")[4]) || 0 : 0;
      };
      return {
        path: location.pathname,
        kind: surface?.dataset?.routeTransitionKind || null,
        surfaceTx: parse(st),
        headerTx: parse(ht),
        bodyTx: parse(bt),
        navTx: parse(nt),
        headerInSurface: Boolean(surface && header && surface.contains(header)),
        frozen: Boolean(document.querySelector("[data-main-shell-cover-bg]")),
      };
    };
    const noteFirst = () => {
      if (!probe.tapAt || probe.firstFrameAt) return;
      const surface = document.querySelector("[data-main-shell-push-surface]");
      if (!surface) return;
      const flagged = surface.getAttribute("data-main-hub-transition-first-frame") === "1";
      const fromClass =
        surface.classList.contains("main-shell-push-surface-from-rtl") ||
        surface.classList.contains("main-shell-push-surface-from-ltr") ||
        surface.classList.contains("main-shell-push-surface-enter-rtl") ||
        surface.classList.contains("main-shell-push-surface-enter-ltr");
      const snap = read();
      if (flagged || fromClass || Math.abs(snap.surfaceTx) > 8) {
        probe.firstFrameAt = performance.now();
      }
    };
    const mo = new MutationObserver(() => {
      if (!probe.tapAt) return;
      const snap = read();
      if (snap.frozen) probe.frozenSeen = true;
      if (snap.kind === "main-hub" || snap.kind === "cover") probe.kindSeen = snap.kind;
      noteFirst();
      if (
        !probe.pathnameAt &&
        snap.path &&
        (snap.path === probe.destPrefix ||
          (probe.destPrefix && snap.path.startsWith(`${probe.destPrefix}/`)))
      ) {
        probe.pathnameAt = performance.now();
      }
      probe.frames.push({ t: performance.now() - probe.tapAt, ...snap });
    });
    const surface = document.querySelector("[data-main-shell-push-surface]");
    if (surface) {
      mo.observe(surface, {
        attributes: true,
        attributeFilter: [
          "class",
          "style",
          "data-route-transition-kind",
          "data-main-hub-transition-first-frame",
        ],
      });
    }
    window.__mainHubNoteFirst = noteFirst;
    window.__mainHubRead = read;
    window.__mainHubMarkTap = (destPrefix) => {
      probe.tapAt = performance.now();
      probe.firstFrameAt = 0;
      probe.pathnameAt = 0;
      probe.settledAt = 0;
      probe.frames = [];
      probe.kindSeen = null;
      probe.frozenSeen = false;
      probe.destPrefix = destPrefix || "";
    };
  });
}

async function sampleHop(page, destPrefix) {
  const started = Date.now();
  let pathnameAt = 0;
  let firstFrameAt = 0;
  let settledAt = 0;
  let maxSurfaceTx = 0;
  let lockstepFail = 0;
  let navMoved = 0;
  let headerInSurface = false;
  let kindSeen = null;
  let frozenSeen = false;
  const midFrames = [];

  while (Date.now() - started < 20_000) {
    const snap = await page.evaluate(() => {
      const probe = window.__mainHubTapProbe;
      const read = window.__mainHubRead;
      const s = read ? read() : null;
      return { probe, s };
    });
    const s = snap.s;
    const probe = snap.probe;
    if (s) {
      maxSurfaceTx = Math.max(maxSurfaceTx, Math.abs(s.surfaceTx));
      headerInSurface = headerInSurface || s.headerInSurface;
      if (s.kind === "main-hub" || s.kind === "cover") kindSeen = s.kind;
      if (s.frozen) frozenSeen = true;
      if (Math.abs(s.navTx) > 2) navMoved += 1;
      /** Header is inside surface → computed header tx is often 0 (local); lockstep = contains + surface moving. */
      if (Math.abs(s.surfaceTx) > 20) {
        midFrames.push(s);
        if (!s.headerInSurface) lockstepFail += 1;
        /** Body local tx should be ~0 while surface moves (same authority parent). */
        if (Math.abs(s.bodyTx) > 20) lockstepFail += 1;
      }
      if (!pathnameAt && pathOk(s.path, destPrefix)) {
        pathnameAt = performance.now();
      }
    }
    if (probe) {
      if (probe.firstFrameAt && !firstFrameAt) firstFrameAt = probe.firstFrameAt;
      if (probe.pathnameAt && !pathnameAt) pathnameAt = probe.pathnameAt;
      if (probe.frozenSeen) frozenSeen = true;
      if (probe.kindSeen) kindSeen = probe.kindSeen;
    }
    if (pathOk(s?.path || "", destPrefix) && Math.abs(s?.surfaceTx || 0) < 4 && kindSeen) {
      const idleKind = s.kind;
      if (idleKind === "none" || idleKind == null) {
        settledAt = performance.now();
        break;
      }
    }
    await page.waitForTimeout(16);
  }

  await page
    .waitForFunction(
      (prefix) => {
        const p = location.pathname;
        return p === prefix || p.startsWith(`${prefix}/`);
      },
      destPrefix,
      { timeout: 12_000 }
    )
    .catch(() => null);

  const tapAt = await page.evaluate(() => window.__mainHubTapProbe?.tapAt || 0);
  const probeFinal = await page.evaluate(() => window.__mainHubTapProbe);
  if (!firstFrameAt && probeFinal?.firstFrameAt) firstFrameAt = probeFinal.firstFrameAt;
  if (!settledAt) settledAt = performance.now();

  const tapToFirst = firstFrameAt && tapAt ? Math.round(firstFrameAt - tapAt) : null;
  const tapToPath = await page.evaluate((prefix) => {
    const probe = window.__mainHubTapProbe;
    if (!probe?.tapAt) return null;
    /** pathname commit approx: first frame sample with matching path after tap */
    const hit = (probe.frames || []).find(
      (f) => f.path === prefix || (typeof f.path === "string" && f.path.startsWith(`${prefix}/`))
    );
    return hit ? Math.round(hit.t) : null;
  }, destPrefix);

  const idle = await page.evaluate(() => (window.__mainHubRead ? window.__mainHubRead() : null));

  return {
    tapToFirstFrameMs: tapToFirst,
    tapToPathnameMs: tapToPath,
    tapToSettledMs: tapAt ? Math.round(settledAt - tapAt) : null,
    maxSurfaceTx,
    headerInSurface,
    lockstepFail,
    navMoved,
    kindSeen,
    frozenSeen,
    idle,
    midFrameCount: midFrames.length,
  };
}

async function clickHop(page, hop) {
  await installTapProbe(page);
  const clicked = await page.evaluate(
    ({ hrefExact, hrefIncludes, destPrefix }) => {
      window.__mainHubMarkTap?.(destPrefix);
      let el = null;
      if (hrefExact) {
        el = document.querySelector(`a.app-bottom-nav-item[href="${hrefExact}"]`);
      } else if (hrefIncludes) {
        el = document.querySelector(`a.app-bottom-nav-item[href*="${hrefIncludes}"]`);
      }
      if (!el) return false;
      el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
      el.click();
      window.__mainHubNoteFirst?.();
      return true;
    },
    {
      hrefExact: hop.hrefExact,
      hrefIncludes: hop.hrefIncludes,
      destPrefix: hop.destPrefix,
    }
  );
  if (!clicked) {
    await page.evaluate((prefix) => window.__mainHubMarkTap?.(prefix), hop.destPrefix);
    await navLocator(page, hop).click({ timeout: 15_000 });
    await page.evaluate(() => window.__mainHubNoteFirst?.());
  }
  return sampleHop(page, hop.destPrefix);
}

function hopPass(row, destPrefix) {
  const navigated = pathOk(row.idle?.path || "", destPrefix);
  const firstFast = row.tapToFirstFrameMs != null && row.tapToFirstFrameMs <= 160;
  const motion = row.maxSurfaceTx > 40;
  const lockstep = row.headerInSurface && row.lockstepFail === 0;
  const navFixed = row.navMoved === 0;
  const noOverlay = !row.frozenSeen;
  const kindOk = row.kindSeen === "main-hub";
  const idleClean =
    !row.idle?.frozen &&
    (row.idle?.kind === "none" || row.idle?.kind == null) &&
    (row.idle?.surfaceTx === 0 || Math.abs(row.idle?.surfaceTx || 0) < 2);
  return {
    pass: navigated && firstFast && motion && lockstep && navFixed && noOverlay && kindOk && idleClean,
    navigated,
    firstFast,
    motion,
    lockstep,
    navFixed,
    noOverlay,
    kindOk,
    idleClean,
  };
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
    const sampled = await clickHop(page, hop);
    const gate = hopPass(sampled, hop.destPrefix);
    const row = { label: hop.label, ...gate, ...sampled };
    hops.push(row);
    console.log(JSON.stringify(row));
    if (!gate.pass) break;
    await page.waitForTimeout(400);
  }
  await context.close();
  return {
    pass: hops.length === FIVE_HOPS.length && hops.every((h) => h.pass),
    hops,
  };
}

async function coldWarmIdle(browser) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
  });
  const auth = await injectAuth(context);
  if (!auth.ok) {
    await context.close();
    return { pass: false, auth };
  }
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/market`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForSelector('a.app-bottom-nav-item[href="/stores"]', { timeout: 30_000 });
  await page.waitForTimeout(2000);

  const deliveryCold = await clickHop(page, {
    label: "Delivery cold",
    hrefExact: "/stores",
    destPrefix: "/stores",
  });
  await page.waitForTimeout(600);
  await page.locator('a.app-bottom-nav-item[href="/market"]').first().click();
  await page.waitForURL((u) => u.pathname.startsWith("/market"), { timeout: 15_000 });
  await page.waitForTimeout(400);
  const deliveryWarm = await clickHop(page, {
    label: "Delivery warm",
    hrefExact: "/stores",
    destPrefix: "/stores",
  });

  let deliveryIdle = null;
  if (IDLE_MS > 0) {
    await page.locator('a.app-bottom-nav-item[href="/market"]').first().click();
    await page.waitForURL((u) => u.pathname.startsWith("/market"), { timeout: 15_000 });
    await page.waitForTimeout(IDLE_MS);
    deliveryIdle = await clickHop(page, {
      label: "Delivery idle",
      hrefExact: "/stores",
      destPrefix: "/stores",
    });
  }

  await page.waitForTimeout(400);
  const chatCold = await clickHop(page, {
    label: "Chat",
    hrefExact: null,
    hrefIncludes: "/community-messenger",
    destPrefix: "/community-messenger",
  });
  await page.waitForTimeout(600);
  await page.locator('a.app-bottom-nav-item[href="/stores"]').first().click();
  await page.waitForURL((u) => u.pathname.startsWith("/stores"), { timeout: 15_000 });
  await page.waitForTimeout(400);
  const chatWarm = await clickHop(page, {
    label: "Chat warm",
    hrefExact: null,
    hrefIncludes: "/community-messenger",
    destPrefix: "/community-messenger",
  });

  let chatIdle = null;
  if (IDLE_MS > 0) {
    await page.locator('a.app-bottom-nav-item[href="/stores"]').first().click();
    await page.waitForURL((u) => u.pathname.startsWith("/stores"), { timeout: 15_000 });
    await page.waitForTimeout(IDLE_MS);
    chatIdle = await clickHop(page, {
      label: "Chat idle",
      hrefExact: null,
      hrefIncludes: "/community-messenger",
      destPrefix: "/community-messenger",
    });
  }

  const rows = [
    { name: "delivery_cold", ...deliveryCold, ...hopPass(deliveryCold, "/stores") },
    { name: "delivery_warm", ...deliveryWarm, ...hopPass(deliveryWarm, "/stores") },
    chatCold ? { name: "chat_cold", ...chatCold, ...hopPass(chatCold, "/community-messenger") } : null,
    { name: "chat_warm", ...chatWarm, ...hopPass(chatWarm, "/community-messenger") },
  ].filter(Boolean);
  if (deliveryIdle) rows.push({ name: "delivery_idle", ...deliveryIdle, ...hopPass(deliveryIdle, "/stores") });
  if (chatIdle) rows.push({ name: "chat_idle", ...chatIdle, ...hopPass(chatIdle, "/community-messenger") });

  await context.close();
  const pass = rows.every((r) => r.pass);
  return { pass, rows };
}

async function rapidTap(browser) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
  });
  const auth = await injectAuth(context);
  if (!auth.ok) {
    await context.close();
    return { pass: false, auth };
  }
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/market`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForSelector('a.app-bottom-nav-item[href="/stores"]', { timeout: 30_000 });
  await page.waitForTimeout(1500);

  await page.evaluate(() => {
    document.querySelector('a.app-bottom-nav-item[href="/stores"]')?.click();
  });
  await page.waitForTimeout(80);
  await page.evaluate(() => {
    document.querySelector('a.app-bottom-nav-item[href*="/community-messenger"]')?.click();
  });
  await page
    .waitForFunction(() => location.pathname.startsWith("/community-messenger"), { timeout: 20_000 })
    .catch(() => null);
  await page.waitForTimeout(700);
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
  const pass =
    pathOk(idle.path, "/community-messenger") &&
    !idle.frozen &&
    (idle.kind === "none" || idle.kind == null) &&
    (idle.transform === "none" || idle.transform?.includes("matrix(1, 0, 0, 1"));
  await context.close();
  return { pass, idle };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });

  if (FIVE_MAIN) {
    const five = await fiveMain(browser);
    const rapid = await rapidTap(browser);
    await browser.close();
    const report = { mode: "five_main", origin: ORIGIN, five, rapid };
    fs.writeFileSync(path.join(OUT, "FIVE-MAIN.json"), JSON.stringify(report, null, 2));
    const pass = five.pass && rapid.pass;
    console.log(`MAIN HUB INTENT 5 MAIN: ${pass ? "PASS" : "FAIL"}`);
    process.exit(pass ? 0 : 1);
  }

  if (COLD_WARM || IDLE_MS > 0) {
    const cold = await coldWarmIdle(browser);
    await browser.close();
    const report = { mode: "cold_warm_idle", origin: ORIGIN, idleMs: IDLE_MS, ...cold };
    fs.writeFileSync(path.join(OUT, "COLD-WARM-IDLE.json"), JSON.stringify(report, null, 2));
    console.log(`MAIN HUB COLD/WARM/IDLE: ${cold.pass ? "PASS" : "FAIL"}`);
    for (const r of cold.rows || []) {
      console.log(
        JSON.stringify({
          name: r.name,
          pass: r.pass,
          tapToFirstFrameMs: r.tapToFirstFrameMs,
          tapToPathnameMs: r.tapToPathnameMs,
          tapToSettledMs: r.tapToSettledMs,
        })
      );
    }
    process.exit(cold.pass ? 0 : 1);
  }

  const five = await fiveMain(browser);
  await browser.close();
  const report = { mode: "default_five", origin: ORIGIN, ...five };
  fs.writeFileSync(path.join(OUT, "REPORT.json"), JSON.stringify(report, null, 2));
  console.log(`MAIN HUB INTENT: ${five.pass ? "PASS" : "FAIL"}`);
  process.exit(five.pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
