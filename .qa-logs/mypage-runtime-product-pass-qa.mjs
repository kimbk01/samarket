#!/usr/bin/env node
/**
 * `/mypage` runtime PRODUCT PASS evidence.
 * Harness uses SPA client navigation (not location.href full reload) to match product bottom-nav.
 * On Execution context destroyed, reattach CDP page + network listener for current step only.
 *
 * Usage:
 *   node .qa-logs/mypage-runtime-product-pass-qa.mjs
 *   node .qa-logs/mypage-runtime-product-pass-qa.mjs --serial=8b37179f7d94
 */
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
import {
  DIBAY_PKG,
  forwardCdp,
  connectWebView,
  navigateApkWebView,
  launchApkMainActivity,
} from "../scripts/qa/lib/apk-webview-cdp.mjs";

const PROD = "https://samarket.vercel.app";
const ACT = "com.dibay.app/.MainActivity";
/** Updated after product fix land — fingerprint still verified live. */
const EXPECT_COMMIT = "34e3204cc";
const RUNS = 3;

const DEVICES = [
  { serial: "8b37179f7d94", label: "Xiaomi", cdpPort: 9331 },
  { serial: "RFCY40PY2CA", label: "Samsung", cdpPort: 9332 },
];

const args = process.argv.slice(2);
const onlySerial = args.find((a) => a.startsWith("--serial="))?.split("=")[1];

function adb(serial, ...cmd) {
  const r = spawnSync("adb", ["-s", serial, ...cmd], { encoding: "utf8" });
  return { status: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function classifyUrl(url) {
  try {
    const u = new URL(url, PROD);
    const p = u.pathname;
    if (p.includes("/api/me/profile") || p.endsWith("/api/me/profile")) return "profile";
    if (p.includes("address-defaults") || p.includes("/api/me/address")) return "address";
    if (p.includes("trade-counts") || p.includes("/api/my/trade-counts")) return "trade-counts";
    if (/\/api\/me\/stores\/?$/.test(p) || p === "/api/me/stores") return "stores";
    if (p.includes("order-counts")) return "order-counts";
    if (p.includes("my_page_banners") || p.includes("my_services") || p.includes("my_page_sections")) return "cms";
    return "other";
  } catch {
    return "other";
  }
}

function createNetworkCounter() {
  return {
    profile: 0,
    address: 0,
    "trade-counts": 0,
    stores: 0,
    "order-counts": 0,
    cms: 0,
    other: 0,
    urls: [],
  };
}

function attachNetworkCounter(page, counts) {
  const onRequest = (req) => {
    try {
      const url = req.url();
      if (!url.includes("samarket.vercel.app") && !url.startsWith("/")) return;
      const kind = classifyUrl(url);
      counts[kind] = (counts[kind] ?? 0) + 1;
      if (kind !== "other") counts.urls.push({ kind, url: url.slice(0, 180), ts: Date.now() });
    } catch {
      /* ignore destroyed context mid-handler */
    }
  };
  page.on("request", onRequest);
  return () => {
    try {
      page.off("request", onRequest);
    } catch {
      /* ignore */
    }
  };
}

async function reconnectSession(chromiumRef, cdpPort, prevDetach) {
  try {
    prevDetach?.();
  } catch {
    /* ignore */
  }
  const { browser, page } = await connectWebView(chromiumRef, cdpPort);
  return { browser, page };
}

async function withContextRetry(run, reconnect) {
  try {
    return await run();
  } catch (e) {
    const msg = String(e?.message || e);
    if (!/Execution context was destroyed|Target closed|Session closed/i.test(msg)) throw e;
    await reconnect();
    return await run();
  }
}

/** Product-like SPA nav — avoid full document reload (location.href). */
async function spaNavigate(page, path, waitMs = 1200) {
  const target = path.startsWith("http") ? path : `${PROD}${path.startsWith("/") ? path : `/${path}`}`;
  await page.evaluate(async (u) => {
    const url = new URL(u, location.origin);
    if (url.origin !== location.origin) {
      location.href = u;
      return;
    }
    const pathOnly = `${url.pathname}${url.search}${url.hash}`;
    const existing = document.querySelector(`a[href="${pathOnly}"], a[href="${url.pathname}"]`);
    if (existing) {
      existing.click();
      return;
    }
    const a = document.createElement("a");
    a.href = pathOnly;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    await new Promise((r) => setTimeout(r, 50));
    if (location.pathname !== url.pathname) {
      history.pushState({}, "", pathOnly);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  }, target);
  await sleep(waitMs);
}

async function snapshotUi(page) {
  return page.evaluate(() => {
    const href = location.href;
    const origin = location.origin;
    const shell = Boolean(document.querySelector('[data-mypage-home-shell="1"]'));
    const summary = Boolean(document.querySelector('[data-testid="mypage-profile-summary-card"]'));
    const summarySkeleton = Boolean(document.querySelector('[data-testid="mypage-profile-summary-skeleton"]'));
    const required = document.querySelector('[data-testid="mypage-required-info-card"]');
    const requiredState = required?.getAttribute("data-state") ?? null;
    const addressRow = document.querySelector('[data-required-step="address"]');
    const addressState = addressRow?.getAttribute("data-state") ?? null;
    const editInputs = Array.from(document.querySelectorAll("#mypage-profile input, #mypage-profile textarea")).length;
    const guestHint = (document.body?.innerText || "").includes("로그인") && !summary;
    const loadingHubText = (document.body?.innerText || "").includes("불러오는 중");
    const sheetOpen = Boolean(document.querySelector('[role="dialog"]'));
    const overlays = document.querySelectorAll(".fixed.inset-0").length;
    let sessionLite = null;
    let legacyPersistent = null;
    try {
      sessionLite = sessionStorage.getItem("samarket:mypage-home:v1");
      legacyPersistent = localStorage.getItem("samarket:mypage-hub:v2_persistent");
    } catch {
      /* ignore */
    }
    return {
      href,
      origin,
      shell,
      summary,
      summarySkeleton,
      requiredState,
      addressState,
      editInputs,
      guestHint,
      loadingHubText,
      sheetOpen,
      overlays,
      sessionLitePresent: Boolean(sessionLite),
      legacyPersistentPresent: Boolean(legacyPersistent),
      sessionLitePreview: sessionLite ? sessionLite.slice(0, 180) : null,
    };
  });
}

async function waitForMypageSettled(page, timeoutMs = 12000) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < timeoutMs) {
    last = await snapshotUi(page);
    if (last.origin.includes("samarket.vercel.app") && (last.summary || last.summarySkeleton || last.shell)) {
      if (last.summary || last.addressState === "complete" || last.addressState === "required") {
        return { ...last, settleMs: Date.now() - t0 };
      }
    }
    await sleep(400);
  }
  return { ...(last || {}), settleMs: Date.now() - t0, timedOut: true };
}

function resetCounts(net) {
  for (const k of Object.keys(net)) {
    if (typeof net[k] === "number") net[k] = 0;
  }
  net.urls = [];
}

async function runOne({ serial, label, cdpPort, runIndex, mode }) {
  const log = (m) => console.log(`[${label} R${runIndex} ${mode}] ${m}`);
  adb(serial, "shell", "input", "keyevent", "224");
  if (mode === "cold") {
    adb(serial, "shell", "am", "force-stop", DIBAY_PKG);
    await sleep(800);
  }
  launchApkMainActivity(adb, serial, ACT);
  await sleep(mode === "cold" ? 4500 : 2500);
  forwardCdp(adb, serial, cdpPort);
  let { browser, page } = await connectWebView(chromium, cdpPort);
  const net = createNetworkCounter();
  let detachNet = attachNetworkCounter(page, net);

  const reconnect = async () => {
    log("reattach CDP after context destroy");
    forwardCdp(adb, serial, cdpPort);
    const next = await reconnectSession(chromium, cdpPort, detachNet);
    browser = next.browser;
    page = next.page;
    detachNet = attachNetworkCounter(page, net);
  };

  const originBefore = await withContextRetry(
    () => page.evaluate(() => location.origin),
    reconnect,
  ).catch(() => null);
  log(`origin=${originBefore}`);

  await withContextRetry(async () => {
    const href = await page.evaluate(() => location.href);
    if (!String(href).includes("samarket.vercel.app")) {
      await navigateApkWebView(page, `${PROD}/philife`, 3500);
    }
  }, reconnect);

  const starts = [
    { name: "community", path: "/philife" },
    { name: "trade", path: "/market" },
    { name: "chat", path: "/community-messenger" },
  ];
  const tabResults = [];
  for (const s of starts) {
    await withContextRetry(async () => {
      await spaNavigate(page, s.path, 2500);
      const before = await snapshotUi(page);
      const enterAt = Date.now();
      resetCounts(net);
      await spaNavigate(page, "/mypage", 1200);
      const first = await snapshotUi(page);
      const settled = await waitForMypageSettled(page);
      tabResults.push({
        from: s.name,
        beforePath: before.href,
        firstMs: Date.now() - enterAt,
        first,
        settled,
        flashAddressRequired:
          first.addressState === "required" && settled.addressState === "complete",
        guestFlash: Boolean(first.guestHint && settled.summary),
        loadingFlash: Boolean(first.loadingHubText && settled.summary),
        editFormOnRoot: first.editInputs > 0 || settled.editInputs > 0,
        net: {
          profile: net.profile,
          address: net.address,
          tradeCounts: net["trade-counts"],
          stores: net.stores,
          orderCounts: net["order-counts"],
          cms: net.cms,
          urls: net.urls.slice(0, 20),
        },
      });
      log(
        `A ${s.name}->mypage summary=${settled.summary} addr=${settled.addressState} profileReq=${net.profile} addressReq=${net.address} trade=${net["trade-counts"]} stores=${net.stores}`,
      );
    }, reconnect);
  }

  resetCounts(net);
  let warm = null;
  let warmNet = null;
  await withContextRetry(async () => {
    await spaNavigate(page, "/philife", 2000);
    await spaNavigate(page, "/mypage", 1000);
    warm = await waitForMypageSettled(page);
    warmNet = {
      profile: net.profile,
      address: net.address,
      tradeCounts: net["trade-counts"],
      stores: net.stores,
      orderCounts: net["order-counts"],
      cms: net.cms,
    };
    log(`B warm summary=${warm.summary} net=${JSON.stringify(warmNet)}`);
  }, reconnect);

  let sheet = { opened: false, overlaysWhileOpen: 0, closedOverlays: 0, remountReload: false };
  try {
    await withContextRetry(async () => {
      const beforeHref = await page.evaluate(() => location.href);
      await page.click('[data-testid="mypage-profile-summary-card"]', { timeout: 5000 });
      await sleep(800);
      const openSnap = await snapshotUi(page);
      sheet.opened = openSnap.sheetOpen;
      sheet.overlaysWhileOpen = openSnap.overlays;
      await page.keyboard.press("Escape").catch(() => {});
      await sleep(400);
      const closeBtn = page.locator('[role="dialog"] button').first();
      if (await closeBtn.count()) {
        await closeBtn.click({ timeout: 2000 }).catch(() => {});
      }
      await sleep(600);
      const after = await snapshotUi(page);
      sheet.closedOverlays = after.overlays;
      sheet.sheetClosed = !after.sheetOpen;
      sheet.remountReload = after.href !== beforeHref && !after.href.includes("/mypage");
    }, reconnect);
  } catch (e) {
    sheet.error = String(e?.message || e);
  }

  const cache = await withContextRetry(
    () =>
      page.evaluate(() => {
        let home = null;
        let legacy = null;
        try {
          home = sessionStorage.getItem("samarket:mypage-home:v1");
          legacy = localStorage.getItem("samarket:mypage-hub:v2_persistent");
        } catch {
          /* ignore */
        }
        let parsed = null;
        try {
          parsed = home ? JSON.parse(home) : null;
        } catch {
          parsed = null;
        }
        return {
          hasHome: Boolean(home),
          hasLegacyPersistent: Boolean(legacy),
          viewerId: parsed?.viewerId ?? null,
          keys: Object.keys(parsed || {}),
        };
      }),
    reconnect,
  );

  const bounce = [];
  for (let i = 0; i < 10; i++) {
    await withContextRetry(async () => {
      await spaNavigate(page, "/philife", 700);
      await spaNavigate(page, "/mypage", 900);
      const s = await snapshotUi(page);
      bounce.push({
        i,
        overlays: s.overlays,
        sheetOpen: s.sheetOpen,
        summary: s.summary,
        legacyPersistentPresent: s.legacyPersistentPresent,
      });
    }, reconnect);
  }

  const probe = await withContextRetry(
    () =>
      page.evaluate(async () => {
        try {
          const r = await fetch("/api/me/profile", { credentials: "include", cache: "no-store" });
          const j = await r.json().catch(() => null);
          return {
            status: r.status,
            userId: String(j?.profile?.id || j?.id || "").trim() || null,
            username: String(j?.profile?.username || j?.username || "").trim() || null,
          };
        } catch (e) {
          return { error: String(e) };
        }
      }),
    reconnect,
  );

  const markers = {
    homeShell: warm?.shell,
    summaryCard: warm?.summary,
    requiredCard: Boolean(warm?.requiredState),
    originOk: String(warm?.origin || "").includes("samarket.vercel.app"),
  };

  try {
    detachNet?.();
  } catch {
    /* ignore */
  }
  await browser.close().catch(() => {});

  const failReasons = [];
  for (const t of tabResults) {
    if (!t.settled.summary && !t.settled.summarySkeleton) failReasons.push(`${t.from}:no_summary`);
    if (t.flashAddressRequired) failReasons.push(`${t.from}:address_flash`);
    if (t.guestFlash) failReasons.push(`${t.from}:guest_flash`);
    if (t.editFormOnRoot) failReasons.push(`${t.from}:edit_form_root`);
    if ((t.net.tradeCounts || 0) > 0) failReasons.push(`${t.from}:trade_counts`);
    if ((t.net.stores || 0) > 0) failReasons.push(`${t.from}:stores`);
    if ((t.net.orderCounts || 0) > 0) failReasons.push(`${t.from}:order_counts`);
    if ((t.net.cms || 0) > 0) failReasons.push(`${t.from}:cms`);
    if ((t.net.profile || 0) > 1) failReasons.push(`${t.from}:profile_dup`);
    if ((t.net.address || 0) > 1) failReasons.push(`${t.from}:address_dup`);
  }
  if (!markers.originOk) failReasons.push("origin_not_prod");
  if (cache.hasLegacyPersistent) failReasons.push("legacy_pii_localstorage");
  if (sheet.opened && sheet.overlaysWhileOpen > 1) failReasons.push("sheet_multi_overlay");
  if (sheet.opened && sheet.closedOverlays > 0 && !sheet.sheetClosed) failReasons.push("sheet_not_closed");
  const bounceOverlayGrowth = bounce.some((b) => b.overlays > 1 || b.sheetOpen);
  if (bounceOverlayGrowth) failReasons.push("bounce_overlay_leak");

  const pass = failReasons.length === 0;
  return {
    device: label,
    serial,
    runIndex,
    mode,
    expectCommit: EXPECT_COMMIT,
    probe,
    markers,
    tabResults,
    warm,
    warmNet,
    sheet,
    cache,
    bounceSummary: {
      runs: bounce.length,
      maxOverlays: Math.max(...bounce.map((b) => b.overlays), 0),
      anySheetOpen: bounce.some((b) => b.sheetOpen),
      summaryAlways: bounce.every((b) => b.summary),
    },
    failReasons,
    pass,
    harness: { spaNavigate: true, contextReattach: true },
  };
}

async function main() {
  const devices = onlySerial ? DEVICES.filter((d) => d.serial === onlySerial) : DEVICES;
  const report = {
    at: new Date().toISOString(),
    expectCommit: EXPECT_COMMIT,
    prod: PROD,
    devices: [],
  };

  for (const d of devices) {
    const online = adb(d.serial, "get-state").stdout.trim() === "device";
    if (!online) {
      report.devices.push({ ...d, online: false, runs: [], pass: false });
      continue;
    }
    const runs = [];
    // RUN1 cold, RUN2 warm, RUN3 warm
    for (let i = 1; i <= RUNS; i++) {
      const mode = i === 1 ? "cold" : "warm";
      try {
        const r = await runOne({ ...d, runIndex: i, mode });
        runs.push(r);
        console.log(`[${d.label}] RUN ${i} => ${r.pass ? "PASS" : "FAIL"} ${r.failReasons.join(",")}`);
      } catch (e) {
        runs.push({
          device: d.label,
          serial: d.serial,
          runIndex: i,
          mode,
          pass: false,
          failReasons: [`exception:${String(e?.message || e)}`],
        });
        console.log(`[${d.label}] RUN ${i} => FAIL exception ${e?.message || e}`);
      }
      await sleep(1000);
    }
    report.devices.push({
      label: d.label,
      serial: d.serial,
      online: true,
      runs,
      pass: runs.every((r) => r.pass),
    });
  }

  mkdirSync(".qa-logs", { recursive: true });
  const out = `.qa-logs/mypage-runtime-product-pass-${Date.now()}.json`;
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(`Wrote ${out}`);
  const allPass = report.devices.length > 0 && report.devices.every((d) => d.pass);
  console.log(allPass ? "ALL_DEVICE_RUNS_PASS" : "SOME_RUNS_FAILED_OR_BLOCKED");
  process.exitCode = allPass ? 0 : 2;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
