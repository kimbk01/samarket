import { chromium } from "/Users/bkkim/projects/samarket-wt-callpip/node_modules/@playwright/test/index.mjs";
const BASE = process.argv[2], OUT = process.argv[3];
const b = await chromium.launch({ executablePath: "/Users/bkkim/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell" });
// [기기, 창 폭, 키보드 전 높이, 키보드 뒤 높이, 화면 방향, 이름]
const cases = [
  ["TABLET_ANDROID", 601, 1006, 560, "portraitPrimary", "xiaomi-port"],
  ["TABLET_ANDROID", 1006, 601, 260, "landscapePrimary", "xiaomi-land"],
  ["TABLET_IPAD", 820, 1180, 780, "portraitPrimary", "ipad-port"],
  ["TABLET_IPAD", 1180, 820, 420, "landscapePrimary", "ipad-land"],
];
for (const [dc, w, h0, h1, orient, name] of cases) {
  const ctx = await b.newContext({ viewport: { width: w, height: h0 }, locale: "ko-KR" });
  await ctx.addInitScript((dc) => { window.__DIBAY_DEVICE_CLASS__ = { deviceClass: dc, source: "test" }; }, dc);
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  const setM = (hh) => cdp.send("Emulation.setDeviceMetricsOverride", { width: w, height: hh, deviceScaleFactor: 1, mobile: false, screenWidth: orient.startsWith("portrait") ? Math.min(w, h0) : Math.max(w, h0), screenHeight: orient.startsWith("portrait") ? Math.max(w, h0) : Math.min(w, h0), screenOrientation: { type: orient, angle: orient.startsWith("portrait") ? 0 : 90 } });
  await setM(h0);
  await p.goto(BASE + "/philife", { waitUntil: "load", timeout: 120000 });
  await p.waitForSelector("article", { timeout: 120000 }).catch(() => {});
  await p.waitForTimeout(2000);
  const read = () => p.evaluate(() => ({ orient: screen.orientation?.type, h: innerHeight, rail: document.documentElement.hasAttribute("data-shell-bottom-nav-side-rail"), switching: document.documentElement.getAttribute("data-shell-nav-switching") }));
  const before = await read();
  await setM(h1); await p.waitForTimeout(800);
  const after = await read();
  await p.screenshot({ path: `${OUT}/kbd-${name}.png` });
  await setM(h0); await p.waitForTimeout(800);
  const back = await read();
  console.log(name, JSON.stringify({ before, keyboard: after, closed: back }));
  await ctx.close();
}
await b.close();
