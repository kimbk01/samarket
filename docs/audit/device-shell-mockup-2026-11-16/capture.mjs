// 운영 화면(비로그인·한국어)을 그린 뒤 .app-shell DOM 과 이미지를 시안 폴더로 받는다.
import { chromium } from "/Users/bkkim/projects/samarket-wt-callpip/node_modules/@playwright/test/index.mjs";
import { writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";

const OUT = "/Users/bkkim/projects/samarket/docs/audit/device-shell-mockup-2026-11-16/";
mkdirSync(OUT + "img", { recursive: true });
const PAGES = {
  home: "/home",
  stores: "/stores",
  lounge: "/philife",
  detail: "/philife/5439f751-b393-4d41-9a14-9919b53c4475",
};
const browser = await chromium.launch({ executablePath: "/Users/bkkim/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell" });
const ctx = await browser.newContext({
  viewport: { width: 1006, height: 900 },
  locale: "ko-KR",
  extraHTTPHeaders: { "Accept-Language": "ko-KR,ko;q=0.9" },
});
await ctx.addCookies([{ name: "samarket_signup_locale", value: "ko", domain: "samarket.vercel.app", path: "/" }]);
const page = await ctx.newPage();
const imgMap = new Map();
const out = {};
for (const [key, path] of Object.entries(PAGES)) {
  await page.goto("https://samarket.vercel.app" + path, { waitUntil: "load", timeout: 60000 });
  await page.waitForTimeout(7000);
  const data = await page.evaluate(() => {
    const shell = document.querySelector(".app-shell").cloneNode(true);
    shell.querySelectorAll("nav[data-app-bottom-nav], script, noscript").forEach((n) => n.remove());
    const srcs = [...shell.querySelectorAll("img")].map((i) => i.currentSrc || i.src);
    shell.querySelectorAll("img").forEach((i) => { i.setAttribute("src", i.currentSrc || i.src); i.removeAttribute("srcset"); i.removeAttribute("sizes"); i.setAttribute("loading", "eager"); });
    return { html: shell.innerHTML, cls: document.querySelector(".app-shell").className, srcs, lang: document.documentElement.lang };
  });
  for (const s of data.srcs) {
    if (!s || s.startsWith("data:") || imgMap.has(s)) continue;
    try {
      const r = await ctx.request.get(s);
      if (!r.ok()) continue;
      const ct = r.headers()["content-type"] || "";
      const ext = ct.includes("svg") ? "svg" : ct.includes("png") ? "png" : ct.includes("jpeg") ? "jpg" : ct.includes("gif") ? "gif" : "webp";
      const name = "img/" + createHash("sha1").update(s).digest("hex").slice(0, 12) + "." + ext;
      writeFileSync(OUT + name, await r.body());
      imgMap.set(s, name);
    } catch {}
  }
  let html = data.html;
  for (const [s, n] of imgMap) html = html.split(s.replaceAll("&", "&amp;")).join(n).split(s).join(n);
  out[key] = { html, cls: data.cls, lang: data.lang };
  console.log(key, html.length, "imgs", data.srcs.length, "lang", data.lang);
}
writeFileSync(OUT + "captured.json", JSON.stringify(out));
await browser.close();
