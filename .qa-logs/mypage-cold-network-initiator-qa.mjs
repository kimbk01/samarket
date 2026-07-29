#!/usr/bin/env node
/**
 * Network-only Xiaomi/Samsung cold /mypage initiator probe.
 * Collects CDP network + window.__SAMARKET_MYPAGE_NET_MARKERS__.
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
const EXPECT = "markers_pending";
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

async function runCold({ serial, label, cdpPort, runIndex }) {
  const log = (m) => console.log(`[${label} cold${runIndex}] ${m}`);
  adb(serial, "shell", "input", "keyevent", "224");
  adb(serial, "shell", "am", "force-stop", DIBAY_PKG);
  await sleep(900);
  launchApkMainActivity(adb, serial, ACT);
  await sleep(5000);
  forwardCdp(adb, serial, cdpPort);
  const { browser, page } = await connectWebView(chromium, cdpPort);

  // ensure production shell
  const origin = await page.evaluate(() => location.origin).catch(() => null);
  if (!String(origin || "").includes("samarket.vercel.app")) {
    await navigateApkWebView(page, `${PROD}/philife`, 4000);
  } else {
    await navigateApkWebView(page, `${PROD}/philife`, 2500);
  }
  await sleep(1500);

  const consoleMarkers = [];
  page.on("console", (msg) => {
    const text = msg.text();
    if (text.includes("[mypage-net-marker]")) consoleMarkers.push({ ts: Date.now(), text: text.slice(0, 1200) });
  });

  const net = { profile: 0, address: 0, stores: 0, "trade-counts": 0, "order-counts": 0, cms: 0, urls: [] };
  page.on("request", (req) => {
    const url = req.url();
    if (!url.includes("samarket.vercel.app")) return;
    const kind = classifyUrl(url);
    if (kind === "other") return;
    net[kind] = (net[kind] || 0) + 1;
    net.urls.push({ kind, url: url.slice(0, 180), ts: Date.now() });
  });

  // clear marker buffer before mypage enter
  await page.evaluate(() => {
    try {
      window.__SAMARKET_MYPAGE_NET_MARKERS__ = [];
    } catch {
      /* ignore */
    }
  }).catch(() => {});

  const enterAt = Date.now();
  await navigateApkWebView(page, `${PROD}/mypage`, 1500);
  await sleep(5000);

  const ui = await page.evaluate(() => {
    const summary = Boolean(document.querySelector('[data-testid="mypage-profile-summary-card"]'));
    const addressRow = document.querySelector('[data-required-step="address"]');
    const markers = Array.isArray(window.__SAMARKET_MYPAGE_NET_MARKERS__)
      ? window.__SAMARKET_MYPAGE_NET_MARKERS__.slice(-40)
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

  log(
    `summary=${ui.summary} addr=${ui.addressState} profile=${net.profile} address=${net.address} stores=${net.stores} markers=${(ui.markers || []).length} fails=${fail.join(",") || "none"}`,
  );

  return {
    device: label,
    serial,
    runIndex,
    mode: "cold",
    enterAt,
    net,
    ui,
    consoleMarkers: consoleMarkers.slice(-30),
    failReasons: fail,
    pass: fail.length === 0 && Boolean(ui.summary),
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
