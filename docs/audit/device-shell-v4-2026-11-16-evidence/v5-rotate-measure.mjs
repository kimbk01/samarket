import { chromium } from "/Users/bkkim/projects/samarket-wt-callpip/node_modules/@playwright/test/index.mjs";
const BASE = process.argv[2], OUT = process.argv[3];
const b = await chromium.launch({ executablePath: "/Users/bkkim/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell" });
const ctx = await b.newContext({ viewport: { width: 1006, height: 601 }, locale: "ko-KR" });
await ctx.addInitScript(() => { window.__DIBAY_DEVICE_CLASS__ = { deviceClass: "TABLET_ANDROID", source: "test" }; });
const p = await ctx.newPage(); const cdp = await ctx.newCDPSession(p);
const rot = (port) => cdp.send("Emulation.setDeviceMetricsOverride", { width: port ? 601 : 1006, height: port ? 1006 : 601, deviceScaleFactor: 1, mobile: false, screenWidth: port ? 601 : 1006, screenHeight: port ? 1006 : 601, screenOrientation: { type: port ? "portraitPrimary" : "landscapePrimary", angle: port ? 0 : 90 } });
await rot(false);
await p.goto(BASE + "/philife", { waitUntil: "load" }); await p.waitForSelector("article").catch(() => {}); await p.waitForTimeout(2000);
await p.evaluate(() => window.scrollTo(0, 0));
for (const port of [true, false]) {
  await rot(port); const t0 = Date.now(); const rows = [];
  for (const ms of [30, 100, 170, 400]) {
    while (Date.now() - t0 < ms) await p.waitForTimeout(5);
    rows.push([ms, await p.evaluate(() => { const pl = document.querySelector("nav[data-app-bottom-nav] .app-bottom-nav-plane"); const r = pl.getBoundingClientRect(); return { iw: innerWidth, rail: document.documentElement.hasAttribute("data-shell-bottom-nav-side-rail"), x: Math.round(r.left), y: Math.round(r.top), sw: document.documentElement.getAttribute("data-shell-nav-switching"), pad: getComputedStyle(document.querySelector(".app-shell")).paddingLeft }; })]);
    if (ms === 100) { const { data } = await cdp.send("Page.captureScreenshot", { format: "png" }); (await import("node:fs")).writeFileSync(`${OUT}/rotate-${port ? "to-port" : "to-land"}-100ms.png`, Buffer.from(data, "base64")); }
  }
  console.log(port ? "to-port" : "to-land", JSON.stringify(rows));
  await p.waitForTimeout(500);
}
await b.close();
