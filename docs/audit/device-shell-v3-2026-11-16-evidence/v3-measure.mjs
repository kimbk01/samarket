import { chromium } from "/Users/bkkim/projects/samarket-wt-callpip/node_modules/@playwright/test/index.mjs";
const BASE = process.argv[2], OUT = process.argv[3];
const b = await chromium.launch({ executablePath: "/Users/bkkim/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell" });
const cases = [
  ["TABLET_ANDROID", 1006, 601, "xiaomi-land"], ["TABLET_ANDROID", 601, 1006, "xiaomi-port"], ["TABLET_IPAD", 590, 820, "ipad-split"],
  ["PHONE_ANDROID", 384, 832, "samsung"], [null, 1600, 900, "desktop-1600"], [null, 700, 800, "desktop-700"], [null, 447, 667, "desktop-min"],
];
for (const [dc, w, h, name] of cases) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, locale: "ko-KR" });
  if (dc) await ctx.addInitScript((dc) => { window.__DIBAY_DEVICE_CLASS__ = { deviceClass: dc, source: "test" }; }, dc);
  const p = await ctx.newPage();
  for (const path of ["/home", "/philife"]) {
    await p.goto(BASE + path, { waitUntil: "load", timeout: 120000 });
    if (path === "/philife") await p.waitForSelector("article", { timeout: 120000 }).catch(() => {});
    await p.waitForTimeout(2500);
    const r = await p.evaluate(() => {
      const nav = document.querySelector("nav[data-app-bottom-nav]");
      const nr = nav?.getBoundingClientRect();
      const items = [...document.querySelectorAll("nav[data-app-bottom-nav] .app-bottom-nav-item")].map((a) => a.getBoundingClientRect());
      const groupMid = items.length ? Math.round((items[0].top + items[items.length - 1].bottom) / 2) : null;
      const grid = document.querySelector("ul[data-community-operator-top], ul.grid");
      const ul = [...document.querySelectorAll("ul")].find((u) => getComputedStyle(u).display === "grid" && u.querySelector("[data-feed-grid-item]"));
      const cards = ul ? [...ul.querySelectorAll(":scope > [data-feed-grid-item]")].slice(0, 4).map((li) => Math.round(li.getBoundingClientRect().width)) : [];
      const art = document.querySelector("article");
      const bodyW = Math.round(document.querySelector("main")?.getBoundingClientRect().width ?? 0);
      return {
        rail: document.documentElement.hasAttribute("data-shell-bottom-nav-side-rail"),
        nav: nr ? [Math.round(nr.x), Math.round(nr.y), Math.round(nr.width), Math.round(nr.height)] : null,
        navGroupMidY: groupMid, viewportMidY: Math.round(innerHeight / 2),
        feedCols: ul ? getComputedStyle(ul).gridTemplateColumns.split(" ").length : null, cardW: cards,
        cardTitlePx: art ? getComputedStyle(art.querySelector("h3")).fontSize : null,
        hScroll: document.documentElement.scrollWidth > innerWidth,
      };
    });
    console.log(name, path, JSON.stringify(r));
    await p.screenshot({ path: `${OUT}/${name}${path.replace("/", "-")}.png` });
  }
  await ctx.close();
}
await b.close();
