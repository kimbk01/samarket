// S4 회전(창 폭) 시험 — 로컬 개발 서버(이 브랜치), PC 브라우저(= Windows 와 같은 데스크톱 셸), 비로그인
import { chromium } from "/Users/bkkim/projects/samarket-wt-callpip/node_modules/@playwright/test/index.mjs";
const BASE = process.argv[2] || "http://localhost:3105";
const OUT = process.argv[3];
const browser = await chromium.launch({ executablePath: "/Users/bkkim/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell" });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "ko-KR" });
await ctx.addCookies([{ name: "samarket_signup_locale", value: "ko", domain: "localhost", path: "/" }]);
const page = await ctx.newPage();
const logs=[]; page.on("console", m=>{ if(m.text().includes("[extras-dbg]")) logs.push(m.text()); });
const state = (label) =>
  page.evaluate((label) => {
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const frame = document.querySelector(".list-detail-split");
    const h1 = document.querySelector('[data-list-detail-pane="detail"] h1');
    const nav = document.querySelector("nav[data-app-bottom-nav]");
    return {
      label,
      w: innerWidth,
      path: location.pathname,
      split: frame?.dataset.listDetailSplit ?? null,
      sameDetailNode: window.__h1 ? window.__h1 === h1 : null,
      listCardsVisible: [...document.querySelectorAll('[data-list-detail-pane="list"] article')].filter(vis).length,
      listPaneW: Math.round(document.querySelector('[data-list-detail-pane="list"]')?.getBoundingClientRect().width ?? 0),
      headers: [...document.querySelectorAll("header")].filter(vis).map((h) => ({
        t: h.innerText.replace(/\s+/g, " ").slice(0, 24),
        btn: [...h.querySelectorAll("button,a")].map((b) => b.getAttribute("aria-label")).filter(Boolean),
      })),
      navClass: nav ? nav.className.split(" ").filter((c) => c.startsWith("app-bottom-nav-shell")).join(" ") : null,
      fabInList: !!document.querySelector('[data-list-detail-pane="list"] a[href*="/write"], [data-list-detail-pane="list"] button[aria-label*="글쓰기"]'),
    };
  }, label);

const results = [];
const mark=(l)=>logs.push("---- "+l);
await page.goto(BASE + "/philife", { waitUntil: "load", timeout: 300000 });
await page.waitForSelector('[data-list-detail-pane="list"] article a', { timeout: 300000 });
results.push(await state("A 1280 목록"));
await page.screenshot({ path: OUT + "/s4-a-1280-list.png" });
await page.click('[data-list-detail-pane="list"] article a');
await page.waitForURL(/\/philife\/[0-9a-f-]{36}/, { timeout: 300000 });
await page.waitForSelector('[data-list-detail-pane="detail"] h1', { timeout: 300000 });
await page.waitForTimeout(1500);
await page.evaluate(() => { window.__h1 = document.querySelector('[data-list-detail-pane="detail"] h1'); });
mark("B 1280 글 열림"); results.push(await state("B 1280 글 열림"));
await page.screenshot({ path: OUT + "/s4-b-1280-detail.png" });
await page.setViewportSize({ width: 700, height: 900 });
await page.waitForTimeout(1500);
mark("C 700 (좁힘 = 세로 회전)"); results.push(await state("C 700 (좁힘 = 세로 회전)"));
await page.screenshot({ path: OUT + "/s4-c-700-detail.png" });
await page.setViewportSize({ width: 1280, height: 800 });
await page.waitForTimeout(1500);
mark("D 1280 (넓힘 = 가로 회전)"); results.push(await state("D 1280 (넓힘 = 가로 회전)"));
await page.screenshot({ path: OUT + "/s4-d-1280-detail.png" });
console.log(JSON.stringify(results, null, 1));
console.error(logs.join("\n"));
await browser.close();
