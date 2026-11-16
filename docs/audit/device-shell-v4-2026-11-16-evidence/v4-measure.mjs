import { chromium } from "/Users/bkkim/projects/samarket-wt-callpip/node_modules/@playwright/test/index.mjs";
const BASE = process.argv[2], OUT = process.argv[3];
const b = await chromium.launch({ executablePath: "/Users/bkkim/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell" });
const cases = [
  ["TABLET_ANDROID", 1006, 601, "xiaomi-land"], ["TABLET_ANDROID", 601, 1006, "xiaomi-port"],
  ["TABLET_IPAD", 1180, 820, "ipad-land"], ["TABLET_IPAD", 820, 1180, "ipad-port"], ["TABLET_IPAD", 590, 820, "ipad-split"],
  ["PHONE_ANDROID", 384, 832, "samsung"], [null, 1600, 900, "desktop-1600"], [null, 447, 667, "desktop-min"],
];
for (const [dc, w, h, name, scr] of cases) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, screen: { width: scr ? scr[0] : w, height: scr ? scr[1] : h }, locale: "ko-KR" });
  if (dc) await ctx.addInitScript((dc) => { window.__DIBAY_DEVICE_CLASS__ = { deviceClass: dc, source: "test" }; }, dc);
  const p = await ctx.newPage();
  for (const path of ["/home", "/philife"]) {
    await p.goto(BASE + path, { waitUntil: "load", timeout: 120000 });
    if (path === "/philife") await p.waitForSelector("article", { timeout: 120000 }).catch(() => {});
    await p.waitForTimeout(2500);
    const r = await p.evaluate(() => {
      const items = [...document.querySelectorAll("nav[data-app-bottom-nav] .app-bottom-nav-item")].map((a) => a.getBoundingClientRect());
      const rail = document.documentElement.hasAttribute("data-shell-bottom-nav-side-rail");
      const pitch = items.length > 1 ? Math.round(rail ? items[1].top - items[0].top : items[1].left - items[0].left) : null;
      const groupMid = items.length ? Math.round((items[0].top + items[items.length - 1].bottom) / 2) : null;
      const cards = [...document.querySelectorAll('article[data-community-card="post"]')].slice(0, 10).map((a) => [Math.round(a.getBoundingClientRect().height), a.querySelector(".rounded-2xl img, .rounded-2xl") ? "T" : "X"]);
      return { orient: screen.orientation?.type, rail, navY: items[0] ? Math.round(items[0].top) : null, pitch, groupMid, vMid: Math.round(innerHeight / 2), cards, hscroll: document.documentElement.scrollWidth > innerWidth };
    });
    console.log(name, path, JSON.stringify(r));
    await p.screenshot({ path: `${OUT}/${name}-${path.slice(1)}.png` });
  }
  await ctx.close();
}
await b.close();
