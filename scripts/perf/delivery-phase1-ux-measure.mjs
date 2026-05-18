/**
 * PHASE 1 — 배달 체감 속도 실측 (read-only).
 * PLAYWRIGHT_BASE_URL=http://localhost:3000 node scripts/perf/delivery-phase1-ux-measure.mjs
 *
 * Env: DELIVERY_PHASE1_SLUG (default aa11), RUNS (default 3)
 * 인증(선택):
 *   - DELIVERY_PHASE1_STORAGE — Playwright storageState JSON 경로(예: tests/e2e/.auth/cm-storage.json). 있으면 폼 로그인 생략.
 *   - 또는 E2E_TEST_USERNAME + E2E_TEST_PASSWORD — 비우면 비로그인(리다이렉트 시 타임아웃 가능).
 */
import { chromium } from "playwright";
import { writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const origin = (process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const slug = (process.env.DELIVERY_PHASE1_SLUG ?? "aa11").trim();
const runs = Math.max(1, Number(process.env.RUNS) || 3);
const outPath = process.env.DELIVERY_PHASE1_OUT ?? "delivery-phase1-ux-measure.json";
const envUser = process.env.E2E_TEST_USERNAME?.trim();
const envPass = process.env.E2E_TEST_PASSWORD ?? "";
const storageFileRaw = process.env.DELIVERY_PHASE1_STORAGE?.trim();
const storageFile = storageFileRaw ? path.resolve(process.cwd(), storageFileRaw) : "";

function summarizeApiGets(entries) {
  const gets = entries.filter((e) => e.method === "GET" && e.url.includes("/api/stores"));
  const byPath = {};
  for (const g of gets) {
    try {
      const u = new URL(g.url);
      const key = u.pathname + u.search.split("&")[0];
      byPath[key] = (byPath[key] ?? 0) + 1;
    } catch {
      /* ignore */
    }
  }
  const duplicates = Object.entries(byPath).filter(([, n]) => n > 1);
  return { totalGets: gets.length, duplicatePaths: duplicates.length, topDupes: duplicates.slice(0, 8) };
}

async function measureOnce(page, label, fn) {
  const apiLog = [];
  const reqHandler = (req) => {
    const u = req.url();
    if (u.includes("/api/stores")) {
      apiLog.push({ t: Date.now(), method: req.method(), url: u });
    }
  };
  page.on("request", reqHandler);
  const t0 = performance.now();
  let error = null;
  let row = { label };
  try {
    row = await fn(page, t0);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  page.off("request", reqHandler);
  const api = summarizeApiGets(apiLog);
  return { ...row, api, error };
}

async function tryLogin(page, identifier, password) {
  await page.goto(`${origin}/login?next=%2Fstores`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const loginForm = page.locator("form").filter({ has: page.getByRole("button", { name: "로그인", exact: true }) });
  const idInput = loginForm.getByPlaceholder("이메일 또는 로그인 ID");
  const passInput = loginForm.locator('input[type="password"]');
  const submit = loginForm.getByRole("button", { name: "로그인", exact: true });
  await idInput.waitFor({ state: "visible", timeout: 90_000 });
  /* SNS 설정 로드·oauthBusy 가 풀릴 때까지 로그인 버튼 활성화 대기 */
  await submit.waitFor({ state: "visible", timeout: 5_000 });
  await page.waitForFunction(
    () => {
      const btns = [...document.querySelectorAll("button")];
      const b = btns.find((el) => el.textContent?.trim() === "로그인");
      return Boolean(b && !b.disabled);
    },
    null,
    { timeout: 90_000 }
  );
  await idInput.click();
  await idInput.fill("");
  await idInput.fill(identifier);
  await passInput.click();
  await passInput.fill("");
  await passInput.fill(password);
  await submit.click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 45_000 }).catch(() => {});
  const stillOnLogin = page.url().includes("/login");
  let loginAlert = null;
  if (stillOnLogin) {
    loginAlert = await page.locator('[role="alert"]').first().textContent().catch(() => null);
  }
  return { ok: !stillOnLogin, loginAlert };
}

/** @returns {Promise<{ storageState: import('playwright').BrowserContextOptions['storageState'], meta: object } | null>} */
async function obtainAuth(browser) {
  if (!envUser || !envPass) {
    return null;
  }
  const candidates = envUser.includes("@")
    ? [{ label: "env", id: envUser, pass: envPass }]
    : [
        { label: "login_id", id: envUser, pass: envPass },
        { label: "manual_local", id: `${envUser}@manual.local`, pass: envPass },
        { label: "samarket_local", id: `${envUser}@samarket.local`, pass: envPass },
      ];

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  let ok = false;
  /** @type {null | { label: string; id: string }} */
  let used = null;

  for (const c of candidates) {
    await page.goto(`${origin}/`, { waitUntil: "domcontentloaded", timeout: 15_000 }).catch(() => {});
    const success = await tryLogin(page, c.id, c.pass);
    if (success.ok) {
      ok = true;
      used = { label: c.label, id: c.id };
      break;
    }
    if (success.loginAlert) {
      console.error(`login_try_failed ${c.label}: ${success.loginAlert.slice(0, 200)}`);
    }
  }

  if (!ok) {
    await ctx.close();
    throw new Error(
      `delivery-phase1: 로그인 실패 (E2E_TEST_USERNAME=${envUser}). 마지막 URL: ${page.url()}`
    );
  }

  const storageState = await ctx.storageState();
  await ctx.close();
  return { storageState, meta: { ok: true, used, finalUrl: page.url() } };
}

async function main() {
  const browser = await chromium.launch({ headless: true });

  let auth = null;
  if (storageFile) {
    if (!existsSync(storageFile)) {
      console.error(`delivery-phase1: DELIVERY_PHASE1_STORAGE 없음: ${storageFile}`);
      await browser.close();
      process.exit(1);
    }
    auth = {
      storageState: storageFile,
      meta: { ok: true, source: "DELIVERY_PHASE1_STORAGE", path: storageFile },
    };
  } else {
    auth = await obtainAuth(browser).catch((e) => {
      console.error(e.message ?? e);
      return null;
    });
  }

  if (!auth?.storageState && envUser && envPass) {
    await browser.close();
    process.exit(1);
  }

  const all = {
    origin,
    slug,
    captured_at: new Date().toISOString(),
    auth: auth?.meta ?? { skipped: true, reason: storageFile ? "invalid_storage_path" : envUser ? "login_failed" : "no_credentials" },
    routes: {},
  };

  const contextOpts = { viewport: { width: 390, height: 844 } };
  if (auth?.storageState) {
    contextOpts.storageState = auth.storageState;
  }

  for (const routeKey of ["stores", "search", "detail"]) {
    all.routes[routeKey] = [];
    for (let i = 0; i < runs; i++) {
      const ctx = await browser.newContext(contextOpts);
      const page = await ctx.newPage();
      let r;
      if (routeKey === "stores") {
        r = await measureOnce(page, `/stores #${i + 1}`, async (p, t0) => {
          await p.goto(`${origin}/stores`, { waitUntil: "domcontentloaded", timeout: 120_000 });
          const domMs = performance.now() - t0;
          await p.locator("#store-industry-explore").waitFor({ state: "visible", timeout: 90_000 });
          const shellMs = performance.now() - t0;
          await p.getByRole("tablist", { name: "대분류 업종" }).waitFor({ state: "visible", timeout: 30_000 });
          const categoryMs = performance.now() - t0;
          const nav = await p.evaluate(() => {
            const n = performance.getEntriesByType("navigation")[0];
            return n
              ? {
                  domContentLoaded: n.domContentLoadedEventEnd,
                  loadEventEnd: n.loadEventEnd,
                  type: n.type,
                }
              : null;
          });
          return {
            dom_content_loaded_ms: Math.round(domMs),
            shell_visible_ms: Math.round(shellMs),
            category_tab_usable_ms: Math.round(categoryMs),
            first_usable_ms: Math.round(categoryMs),
            header_visible_ms: null,
            first_menu_card_ms: null,
            navigation: nav,
          };
        });
      } else if (routeKey === "search") {
        r = await measureOnce(page, `/stores/search #${i + 1}`, async (p, t0) => {
          await p.goto(`${origin}/stores/search`, { waitUntil: "domcontentloaded", timeout: 120_000 });
          const domMs = performance.now() - t0;
          await p.getByRole("searchbox", { name: "배달 검색어 입력" }).waitFor({ state: "visible", timeout: 90_000 });
          const shellMs = performance.now() - t0;
          return {
            dom_content_loaded_ms: Math.round(domMs),
            shell_visible_ms: Math.round(shellMs),
            first_usable_ms: Math.round(shellMs),
            category_tab_usable_ms: null,
            header_visible_ms: Math.round(shellMs),
            first_menu_card_ms: null,
            navigation: await p.evaluate(() => {
              const n = performance.getEntriesByType("navigation")[0];
              return n ? { domContentLoaded: n.domContentLoadedEventEnd, type: n.type } : null;
            }),
          };
        });
      } else {
        r = await measureOnce(page, `/stores/${slug} #${i + 1}`, async (p, t0) => {
          await p.goto(`${origin}/stores/${encodeURIComponent(slug)}`, {
            waitUntil: "domcontentloaded",
            timeout: 120_000,
          });
          const domMs = performance.now() - t0;
          await p.getByRole("button", { name: "메뉴 검색" }).waitFor({ state: "visible", timeout: 90_000 });
          const headerMs = performance.now() - t0;
          let categoryMs = null;
          try {
            const chipScope = p.locator(".sticky").filter({ has: p.locator("button") }).first();
            await chipScope.waitFor({ state: "visible", timeout: 25_000 });
            categoryMs = performance.now() - t0;
          } catch {
            /* 단일 섹션 매장은 CategoryStickyTabs 미표시 */
          }
          let firstCardMs = null;
          try {
            await p.locator(`a[href*="/stores/${encodeURIComponent(slug)}/p/"]`).first().waitFor({
              state: "visible",
              timeout: 45_000,
            });
            firstCardMs = performance.now() - t0;
          } catch {
            /* 메뉴 로딩 지연 */
          }
          const nav = await p.evaluate(() => {
            const n = performance.getEntriesByType("navigation")[0];
            return n
              ? {
                  domContentLoaded: n.domContentLoadedEventEnd,
                  loadEventEnd: n.loadEventEnd,
                  type: n.type,
                }
              : null;
          });
          return {
            dom_content_loaded_ms: Math.round(domMs),
            shell_visible_ms: Math.round(headerMs),
            header_visible_ms: Math.round(headerMs),
            category_tab_usable_ms: categoryMs != null ? Math.round(categoryMs) : null,
            first_menu_card_ms: firstCardMs != null ? Math.round(firstCardMs) : null,
            first_usable_ms: Math.round(headerMs),
            navigation: nav,
          };
        });
      }
      all.routes[routeKey].push(r);
      await ctx.close();
    }
  }

  await browser.close();
  writeFileSync(outPath, `${JSON.stringify(all, null, 2)}\n`, "utf8");
  console.log(`Wrote ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
