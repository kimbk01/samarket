#!/usr/bin/env node
/**
 * Network-only Xiaomi/Samsung cold /mypage initiator probe (SPA soft-nav).
 * Hard location.href is forbidden for the /mypage enter step — it destroys keep-alive
 * and falsely hides address×4 / stores×1.
 *
 *   node .qa-logs/mypage-cold-network-initiator-qa.mjs
 *   node .qa-logs/mypage-cold-network-initiator-qa.mjs --serial=8b37179f7d94
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
const EXPECT = "7638fd8a0_markers";
const COLD_RUNS = 3;

const DEVICES = [
  { serial: "8b37179f7d94", label: "Xiaomi", cdpPort: 9341 },
  { serial: "RFCY40PY2CA", label: "Samsung", cdpPort: 9342 },
];

const onlySerial = process.argv.find((a) => a.startsWith("--serial="))?.split("=")[1];

function adb(serial, ...cmd) {
  const r = spawnSync("adb", ["-s", serial, ...cmd], { encoding: "utf8" });
  return { status: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function classifyUrl(url) {
  try {
    const u = new URL(url, PROD);
    const p = u.pathname;
    if (p.includes("/api/me/profile")) return "profile";
    if (p.includes("address-defaults")) return "address";
    if (/\/api\/me\/stores\/?$/.test(p)) return "stores";
    if (p.includes("trade-counts")) return "trade-counts";
    if (p.includes("order-counts")) return "order-counts";
    if (p.includes("my_page_banners") || p.includes("my_services") || p.includes("my_page_sections")) return "cms";
    return "other";
  } catch {
    return "other";
  }
}

async function dismissNavConfirmDialog(page) {
  await page.evaluate(() => {
    const dlg = document.querySelector('[aria-labelledby="main-bottom-nav-cross-domain-title"]');
    if (!dlg) return;
    const close = dlg.querySelector('button[aria-label="닫기"], button[aria-label="Close"]');
    if (close) close.click();
    else dlg.remove();
  }).catch(() => {});
  await sleep(200);
}

/**
 * Soft SPA nav via real bottom-nav / in-app <a> click.
 * DO NOT pushState first — that updates location.pathname without Next App Router
 * commit and falsely skips the click fallback (URL=/mypage, summary missing).
 */
async function spaNavigate(page, path, waitMs = 1200) {
  const target = path.startsWith("http") ? path : `${PROD}${path.startsWith("/") ? path : `/${path}`}`;
  const want = new URL(target).pathname;
  await dismissNavConfirmDialog(page);

  const clicked = await page.evaluate((wantPath) => {
    const tabs = Array.from(document.querySelectorAll("a[href]"));
    const exact = tabs.find((el) => (el.getAttribute("href") || "") === wantPath);
    const prefix = tabs.find((el) => {
      const h = el.getAttribute("href") || "";
      return h === wantPath || (wantPath !== "/" && h.startsWith(`${wantPath}/`));
    });
    const el = exact || prefix;
    if (!el) return false;
    el.click();
    return true;
  }, want).catch(() => false);

  await sleep(350);
  await dismissNavConfirmDialog(page);

  let at = await page.evaluate(() => location.pathname).catch(() => "");
  if (at !== want) {
    await page.evaluate(() => {
      const dlg = document.querySelector('[aria-labelledby="main-bottom-nav-cross-domain-title"]');
      if (!dlg) return;
      const btns = Array.from(dlg.querySelectorAll("button"));
      const go = btns.find((b) => /이동|확인|Continue|Go/i.test(b.textContent || ""));
      if (go) go.click();
    }).catch(() => {});
    await sleep(400);
    at = await page.evaluate(() => location.pathname).catch(() => "");
  }

  // Last resort: Next soft router if exposed; never raw pushState-only.
  if (at !== want && !clicked) {
    await page.evaluate((wantPath) => {
      const r = window.next?.router;
      if (r && typeof r.push === "function") r.push(wantPath);
    }, want).catch(() => {});
  }

  // Wait until shell paints (summary or required row) when entering mypage.
  if (want === "/mypage") {
    const t0 = Date.now();
    while (Date.now() - t0 < Math.max(waitMs, 8000)) {
      const snap = await page.evaluate(() => ({
        path: location.pathname,
        summary: Boolean(document.querySelector('[data-testid="mypage-profile-summary-card"]')),
        shell: Boolean(document.querySelector('[data-mypage-home-shell="1"]')),
        addr: document.querySelector('[data-required-step="address"]')?.getAttribute("data-state") ?? null,
      })).catch(() => null);
      if (snap?.path === "/mypage" && (snap.summary || snap.shell || snap.addr)) break;
      await sleep(400);
    }
  } else {
    await sleep(waitMs);
  }
  await dismissNavConfirmDialog(page);
}

async function runCold({ serial, label, cdpPort, runIndex }) {
  const log = (m) => console.log(`[${label} cold${runIndex}] ${m}`);
  adb(serial, "shell", "input", "keyevent", "224");
  adb(serial, "shell", "am", "force-stop", DIBAY_PKG);
  await sleep(900);
  launchApkMainActivity(adb, serial, ACT);
  await sleep(5000);
  forwardCdp(adb, serial, cdpPort);
  const { browser, page } = await connectWebView(chromium, cdpPort);

  // Cold: only hard-nav if WebView is off production. Prefer SPA to philife so keep-alive matches product.
  const origin = await page.evaluate(() => location.origin).catch(() => null);
  if (!String(origin || "").includes("samarket.vercel.app")) {
    await navigateApkWebView(page, `${PROD}/philife`, 4000);
  } else {
    await spaNavigate(page, "/philife", 2500);
  }
  await sleep(800);

  const consoleMarkers = [];
  page.on("console", (msg) => {
    const text = msg.text();
    if (text.includes("[mypage-net-marker]")) consoleMarkers.push({ ts: Date.now(), text: text.slice(0, 1200) });
  });

  // Attach network AFTER philife settle; only count from resetAt onward (mypage enter window).
  const net = { profile: 0, address: 0, stores: 0, "trade-counts": 0, "order-counts": 0, cms: 0, urls: [] };
  let counting = false;
  page.on("request", (req) => {
    if (!counting) return;
    const url = req.url();
    if (!url.includes("samarket.vercel.app")) return;
    const kind = classifyUrl(url);
    if (kind === "other") return;
    net[kind] = (net[kind] || 0) + 1;
    net.urls.push({ kind, url: url.slice(0, 180), ts: Date.now() });
  });

  await page.evaluate(() => {
    try {
      window.__SAMARKET_MYPAGE_NET_MARKERS__ = [];
    } catch {
      /* ignore */
    }
  }).catch(() => {});

  const enterAt = Date.now();
  counting = true;
  await spaNavigate(page, "/mypage", 1500);
  await sleep(5000);
  counting = false;

  const ui = await page.evaluate(() => {
    const summary = Boolean(document.querySelector('[data-testid="mypage-profile-summary-card"]'));
    const addressRow = document.querySelector('[data-required-step="address"]');
    const markers = Array.isArray(window.__SAMARKET_MYPAGE_NET_MARKERS__)
      ? window.__SAMARKET_MYPAGE_NET_MARKERS__.slice(-80)
      : [];
    let sessionLite = null;
    let ownerLite = null;
    let legacy = null;
    try {
      sessionLite = Boolean(sessionStorage.getItem("samarket:mypage-home:v1"));
      ownerLite = Boolean(sessionStorage.getItem("samarket:stores:owner-lite:snapshot:v1"));
      legacy = Boolean(localStorage.getItem("samarket:mypage-hub:v2_persistent"));
    } catch {
      /* ignore */
    }
    return {
      href: location.href,
      pathname: location.pathname,
      origin: location.origin,
      summary,
      addressState: addressRow?.getAttribute("data-state") ?? null,
      markers,
      sessionLite,
      ownerLite,
      legacy,
    };
  }).catch((e) => ({ error: String(e?.message || e) }));

  await browser.close().catch(() => {});

  const fail = [];
  if ((net.profile || 0) > 1) fail.push("profile_gt1");
  if ((net.address || 0) > 1) fail.push("address_gt1");
  if ((net.stores || 0) > 0) fail.push("stores_gt0");
  if ((net["trade-counts"] || 0) > 0) fail.push("trade");
  if ((net["order-counts"] || 0) > 0) fail.push("order");
  if ((net.cms || 0) > 0) fail.push("cms");
  if (!ui.summary) fail.push("no_summary");

  const addrStarts = (ui.markers || []).filter((m) => m.event === "address_defaults_network_start");
  const storeStarts = (ui.markers || []).filter((m) => m.event === "owner_lite_store_network_start");

  log(
    `path=${ui.pathname} summary=${ui.summary} addr=${ui.addressState} profile=${net.profile} address=${net.address} stores=${net.stores} addrStarts=${addrStarts.length} storeStarts=${storeStarts.length} fails=${fail.join(",") || "none"}`,
  );

  return {
    device: label,
    serial,
    runIndex,
    mode: "cold",
    nav: "spa_soft",
    enterAt,
    net,
    ui,
    consoleMarkers: consoleMarkers.slice(-40),
    addressInitiators: addrStarts.map((m) => ({
      caller: m.caller,
      reason: m.reason,
      force: m.force,
      hasInflight: m.hasInflight,
      pathname: m.pathname,
      routeGeneration: m.routeGeneration,
      mypageMountGeneration: m.mypageMountGeneration,
      timestamp: m.timestamp,
    })),
    storeInitiators: storeStarts.map((m) => ({
      subscriber: m.subscriber,
      subscribeReason: m.subscribeReason,
      schedulePathname: m.schedulePathname,
      executionPathname: m.executionPathname,
      timestamp: m.timestamp,
    })),
    failReasons: fail,
    pass: fail.length === 0,
  };
}

async function main() {
  const devices = onlySerial ? DEVICES.filter((d) => d.serial === onlySerial) : DEVICES;
  const report = { at: new Date().toISOString(), expect: EXPECT, prod: PROD, devices: [] };
  for (const d of devices) {
    const online = adb(d.serial, "get-state").stdout.trim() === "device";
    if (!online) {
      report.devices.push({ ...d, online: false, runs: [], pass: false });
      continue;
    }
    const runs = [];
    for (let i = 1; i <= COLD_RUNS; i++) {
      try {
        runs.push(await runCold({ ...d, runIndex: i }));
      } catch (e) {
        runs.push({
          device: d.label,
          serial: d.serial,
          runIndex: i,
          mode: "cold",
          pass: false,
          failReasons: [`exception:${String(e?.message || e)}`],
        });
      }
      await sleep(800);
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
  const out = `.qa-logs/mypage-cold-network-initiator-${Date.now()}.json`;
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(`Wrote ${out}`);
  process.exitCode = report.devices.every((d) => d.pass) ? 0 : 2;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
