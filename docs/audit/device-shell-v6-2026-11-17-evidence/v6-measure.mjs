// 시안 v6 로컬 운영 빌드 계측 — LOUNGE 최대 3열 · 회전 직후 하단 탭(목록 내려 둔 상태)
import { chromium } from "/Users/bkkim/projects/samarket-wt-callpip/node_modules/@playwright/test/index.mjs";
const BASE = process.argv[2];
const b = await chromium.launch({ executablePath: "/Users/bkkim/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell" });
const cols = async (p) => p.evaluate(() => {
  const ul = document.querySelector("ul:has(> li[data-feed-grid-item])");
  return { iw: innerWidth, cols: ul ? getComputedStyle(ul).gridTemplateColumns.split(" ").length : null, colW: ul ? getComputedStyle(ul).gridTemplateColumns : null, hscroll: document.documentElement.scrollWidth > innerWidth };
});
for (const [dc, w, h] of [[null, 447, 667], [null, 1024, 768], [null, 1440, 900], [null, 2247, 1103], ["TABLET_IPAD", 1366, 1024], ["PHONE_ANDROID", 384, 832]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, locale: "ko-KR" });
  if (dc) await ctx.addInitScript((dc) => { window.__DIBAY_DEVICE_CLASS__ = { deviceClass: dc, source: "test" }; }, dc);
  const p = await ctx.newPage();
  await p.goto(BASE + "/philife", { waitUntil: "load", timeout: 120000 }); await p.waitForSelector("article").catch(() => {}); await p.waitForTimeout(2000);
  console.log("cols", dc ?? "DESKTOP(web)", `${w}x${h}`, JSON.stringify(await cols(p)));
  await ctx.close();
}
// 회전: Xiaomi(TABLET_ANDROID) 가로 → 목록 아래로 → 세로 → 하단 탭 보임·숨김 상태를 시간별로
const ctx = await b.newContext({ viewport: { width: 1006, height: 601 }, locale: "ko-KR" });
await ctx.addInitScript(() => { window.__DIBAY_DEVICE_CLASS__ = { deviceClass: "TABLET_ANDROID", source: "test" }; });
const p = await ctx.newPage(); const cdp = await ctx.newCDPSession(p);
const rot = (port) => cdp.send("Emulation.setDeviceMetricsOverride", { width: port ? 601 : 1006, height: port ? 1006 : 601, deviceScaleFactor: 1, mobile: false, screenWidth: port ? 601 : 1006, screenHeight: port ? 1006 : 601, screenOrientation: { type: port ? "portraitPrimary" : "landscapePrimary", angle: port ? 0 : 90 } });
const navState = () => p.evaluate(() => { const n = document.querySelector("nav[data-app-bottom-nav]"); const pl = n.querySelector(".app-bottom-nav-plane").getBoundingClientRect(); return { rail: document.documentElement.hasAttribute("data-shell-bottom-nav-side-rail"), hidden: n.classList.contains("app-bottom-nav-shell--scroll-hidden"), planeTop: Math.round(pl.top), ih: innerHeight }; });
for (const label of ["회전 전 세로에서 내려 두기", "가로에서 내려 두기"]) {
  const startPort = label.startsWith("회전 전 세로");
  await rot(startPort);
  await p.goto(BASE + "/philife", { waitUntil: "load" }); await p.waitForSelector("article").catch(() => {}); await p.waitForTimeout(2000);
  await p.mouse.move(500, 400);
  for (let i = 0; i < 6; i++) { await p.mouse.wheel(0, 400); await p.waitForTimeout(120); }
  await p.waitForTimeout(300);
  const before = await navState();
  if (startPort) { await rot(false); await p.waitForTimeout(800); for (let i = 0; i < 3; i++) { await p.mouse.wheel(0, 300); await p.waitForTimeout(120); } await p.waitForTimeout(300); }
  await rot(true); const t0 = Date.now(); const rows = [];
  for (const ms of [50, 150, 300, 700, 1500, 3500]) { while (Date.now() - t0 < ms) await p.waitForTimeout(5); rows.push([ms, await navState()]); }
  console.log("rotate", label, "before", JSON.stringify(before), "after", JSON.stringify(rows));
}
await b.close();
// (추가) 회전 뒤 사용자가 아래로 스크롤하면 스크롤 숨김은 그대로 동작해야 한다
{
  const b2 = await chromium.launch({ executablePath: "/Users/bkkim/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell" });
  const c2 = await b2.newContext({ viewport: { width: 1006, height: 601 }, locale: "ko-KR" });
  await c2.addInitScript(() => { window.__DIBAY_DEVICE_CLASS__ = { deviceClass: "TABLET_ANDROID", source: "test" }; });
  const q = await c2.newPage(); const d = await c2.newCDPSession(q);
  const r2 = (port) => d.send("Emulation.setDeviceMetricsOverride", { width: port ? 601 : 1006, height: port ? 1006 : 601, deviceScaleFactor: 1, mobile: false, screenWidth: port ? 601 : 1006, screenHeight: port ? 1006 : 601, screenOrientation: { type: port ? "portraitPrimary" : "landscapePrimary", angle: port ? 0 : 90 } });
  await r2(false); await q.goto(BASE + "/philife", { waitUntil: "load" }); await q.waitForSelector("article").catch(() => {}); await q.waitForTimeout(2000);
  await r2(true); await q.waitForTimeout(1200);
  await q.mouse.move(300, 500); for (let i = 0; i < 4; i++) { await q.mouse.wheel(0, 400); await q.waitForTimeout(100); }
  await q.waitForTimeout(200);
  const hid = await q.evaluate(() => document.querySelector("nav[data-app-bottom-nav]").classList.contains("app-bottom-nav-shell--scroll-hidden"));
  await q.waitForTimeout(2200);
  const back = await q.evaluate(() => document.querySelector("nav[data-app-bottom-nav]").classList.contains("app-bottom-nav-shell--scroll-hidden"));
  console.log("after-rotate user scroll: hidden", hid, "→ 1.8s 뒤", back);
  await b2.close();
}
