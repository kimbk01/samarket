/**
 * 디바이 C2C baseline — UI 로그인(`ensureE2eUserSession`) + debug runtime.
 *
 * E2E_TEST_USERNAME / E2E_TEST_PASSWORD (기본 aaaa / 1234)
 * npx playwright test tests/e2e/trade-c2c-perf-baseline-capture.spec.ts
 */
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { setAppLanguageOnPage } from "./helpers/i18n-set-app-language";
import { assertPlaywrightOriginReachable, gotoWithRetry } from "./helpers/playwright-origin-and-session";

async function loginForTradeBaseline(
  page: import("@playwright/test").Page,
  origin: string,
  username: string,
  password: string
): Promise<void> {
  const candidates = [
    username,
    username.includes("@") ? username : `${username}@samarket.local`,
  ];
  for (const id of candidates) {
    await gotoWithRetry(page, `${origin}/login?next=${encodeURIComponent("/market")}`);
    const idBox = page.getByRole("textbox", { name: /이메일 또는 로그인 ID|Email or Login ID/i });
    const passBox = page.locator('input[type="password"]').first();
    const loginBtn = page.getByRole("button", { name: /^로그인$|^Sign in$/i });
    await idBox.waitFor({ state: "visible", timeout: 30_000 });
    await idBox.fill(id);
    await passBox.fill(password);
    await loginBtn.click();
    try {
      await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 45_000 });
    } catch {
      /* next candidate */
    }
    if (!page.url().includes("/login")) {
      const probe = await page.request.get(`${origin}/api/me/settings`);
      if (probe.ok()) return;
    }
  }
  throw new Error(`[trade-baseline] UI 로그인 실패 url=${page.url()}`);
}

type Snap = { appWidePhaseLastMs?: Record<string, number> };

function pickMs(s: Snap | null, key: string): number | null {
  const v = s?.appWidePhaseLastMs?.[key];
  return typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null;
}

async function readSnap(page: import("@playwright/test").Page): Promise<Snap | null> {
  return page.evaluate(() => {
    const w = window as unknown as { getMessengerHomeVerificationSnapshot?: () => Snap };
    return w.getMessengerHomeVerificationSnapshot?.() ?? null;
  });
}

async function waitPaint(page: import("@playwright/test").Page, ms = 500): Promise<void> {
  await page.waitForTimeout(ms);
}

test.describe("trade c2c perf baseline capture", () => {
  test.beforeEach(async ({ context, page }) => {
    await setAppLanguageOnPage(page, "ko");
    await context.addInitScript(() => {
      try {
        sessionStorage.setItem("samarket:debug:runtime", "1");
      } catch {
        /* ignore */
      }
    });
  });

  test("capture trade_c2c phase metrics JSON", async ({ page, baseURL }) => {
    test.setTimeout(420_000);
    const origin = (baseURL ?? "http://127.0.0.1:3000").replace(/\/$/, "");

    await assertPlaywrightOriginReachable(page.request);
    const loginUser = process.env.E2E_TEST_USERNAME?.trim() || "qqqq";
    const loginPass = process.env.E2E_TEST_PASSWORD ?? "1234";
    let loggedIn = false;
    try {
      await loginForTradeBaseline(page, origin, loginUser, loginPass);
      loggedIn = true;
    } catch (loginErr) {
      // eslint-disable-next-line no-console
      console.warn(`[trade-c2c-baseline] UI 로그인 스킵 — ${String(loginErr).slice(0, 120)}`);
    }
    await page.setViewportSize({ width: 390, height: 844 });

    // 1. /market
    await gotoWithRetry(page, `${origin}/market`);
    await waitPaint(page, 2800);
    const afterMarket = await readSnap(page);

    // 2. 상품 상세
    const postLink = page.locator('a[href^="/post/"]').first();
    let afterDetail: Snap | null = afterMarket;
    const hasPost = await postLink.isVisible({ timeout: 20_000 }).catch(() => false);
    if (hasPost) {
      await postLink.click();
      await page.waitForURL(/\/post\//, { timeout: 45_000 });
      await waitPaint(page, 1800);
      afterDetail = await readSnap(page);

      // 3. 채팅하기 (또는 이어가기)
      const chatBtn = page.getByRole("button", { name: /채팅하기|채팅 이어가기|Chat/i }).first();
      if (await chatBtn.isVisible({ timeout: 8_000 }).catch(() => false)) {
        await chatBtn.click();
        await Promise.race([
          page.waitForURL(/\/community-messenger\/rooms\//, { timeout: 45_000 }),
          page.waitForURL(/\/mypage\/trade\/chat\/compose/, { timeout: 45_000 }),
          page.waitForURL(/\/community-messenger/, { timeout: 45_000 }),
        ]).catch(() => undefined);
        await waitPaint(page, 2000);
      }
    }
    const afterChatOpen = await readSnap(page);

    // 4–7. trade-chats 목록 → 방 → 송수신 → 나가기 → 재진입
    if (!loggedIn) {
      const metricsPublic = {
        trade_list_total_ms: pickMs(afterMarket, "trade_list_total_ms"),
        trade_list_payload_bytes: pickMs(afterMarket, "trade_list_payload_bytes"),
        trade_detail_total_ms: pickMs(afterDetail, "trade_detail_total_ms"),
        trade_chat_open_total_ms: null,
        trade_chat_bootstrap_ms: null,
        trade_chat_duplicate_room_guard_ms: null,
        trade_realtime_subscribe_count: null,
        trade_realtime_unsubscribe_count: null,
        trade_realtime_debounce_unsubscribe_count: null,
        trade_memory_heap_used_mb: pickMs(afterMarket, "trade_memory_heap_used_mb"),
        capturedAt: new Date().toISOString(),
        origin,
        scenarios: { loggedIn: false, hasPost, note: "chat/realtime require auth" },
      };
      const outDir = path.join(process.cwd(), "tests", "e2e", ".artifacts");
      fs.mkdirSync(outDir, { recursive: true });
      const outPath = path.join(outDir, "trade-c2c-baseline.json");
      fs.writeFileSync(outPath, JSON.stringify({ trade_c2c_baseline: metricsPublic }, null, 2), "utf8");
      // eslint-disable-next-line no-console
      console.log("\n=== TRADE_C2C_BASELINE_JSON (public-only) ===\n" + JSON.stringify({ trade_c2c_baseline: metricsPublic }, null, 2));
      expect(metricsPublic.trade_list_total_ms, "public /market trade_list_total_ms").not.toBeNull();
      return;
    }

    await gotoWithRetry(page, `${origin}/community-messenger/trade-chats`);
    await waitPaint(page, 2200);
    const tradeRows = page.locator('[data-messenger-chat-row="true"]');
    await tradeRows.first().waitFor({ state: "visible", timeout: 90_000 }).catch(() => undefined);
    await waitPaint(page, 1500);
    const afterTradeList = await readSnap(page);

    const firstRowTap = tradeRows.first().locator('div[role="button"]').first();
    let afterRoom: Snap | null = afterTradeList;
    let afterSend: Snap | null = afterTradeList;
    if (await firstRowTap.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await firstRowTap.click();
      await page.waitForURL(/\/community-messenger\/rooms\//, { timeout: 45_000 }).catch(() => undefined);
      await waitPaint(page, 1200);
      afterRoom = await readSnap(page);

      const ta = page.locator("textarea").first();
      if (await ta.isVisible({ timeout: 12_000 }).catch(() => false)) {
        const probe = `baseline-${Date.now()}`;
        await ta.fill(probe);
        const sendBtn = page.getByRole("button", { name: /^전송$|^Send$/i }).first();
        if (await sendBtn.isVisible().catch(() => false)) {
          await sendBtn.click();
          await waitPaint(page, 600);
        }
        afterSend = await readSnap(page);
      }

      await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => undefined);
      await tradeRows.first().waitFor({ state: "visible", timeout: 45_000 }).catch(() => undefined);
      await waitPaint(page, 900);

      if (await firstRowTap.isVisible().catch(() => false)) {
        await firstRowTap.click();
        await page.waitForURL(/\/community-messenger\/rooms\//, { timeout: 45_000 }).catch(() => undefined);
        await waitPaint(page, 900);
      }
    }
    const afterReenter = await readSnap(page);

    // 8. ko/en
    await setAppLanguageOnPage(page, "en");
    await gotoWithRetry(page, `${origin}/market`);
    await waitPaint(page, 1200);
    await setAppLanguageOnPage(page, "ko");
    await waitPaint(page, 400);

    // 9. 모바일 폭 재확인 (이미 390px)
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoWithRetry(page, `${origin}/market`);
    await waitPaint(page, 1000);
    const afterMobile = await readSnap(page);

    await page.evaluate(() => {
      const g = globalThis as typeof globalThis & {
        performance?: Performance & { memory?: { usedJSHeapSize?: number } };
      };
      const used = g.performance?.memory?.usedJSHeapSize;
      if (typeof used === "number" && Number.isFinite(used)) {
        const mb = used / (1024 * 1024);
        const key = "__samarketAppWidePhaseLastMs" as const;
        const bag = (g as Record<string, Record<string, number>>)[key] ?? {};
        bag.trade_memory_heap_used_mb = Math.round(mb * 10) / 10;
        (g as Record<string, Record<string, number>>)[key] = bag;
      }
    });

    const finalSnap = await readSnap(page);

    const metrics = {
      trade_list_total_ms: pickMs(afterMarket, "trade_list_total_ms"),
      trade_list_payload_bytes: pickMs(afterMarket, "trade_list_payload_bytes"),
      trade_detail_total_ms: pickMs(afterDetail, "trade_detail_total_ms"),
      trade_chat_open_total_ms: pickMs(afterChatOpen, "trade_chat_open_total_ms"),
      trade_chat_bootstrap_ms: pickMs(afterChatOpen, "trade_chat_bootstrap_ms"),
      trade_chat_duplicate_room_guard_ms: pickMs(afterReenter, "trade_chat_duplicate_room_guard_ms"),
      trade_realtime_subscribe_count: pickMs(afterTradeList, "trade_realtime_subscribe_count"),
      trade_realtime_unsubscribe_count: pickMs(afterTradeList, "trade_realtime_unsubscribe_count"),
      trade_realtime_debounce_unsubscribe_count: pickMs(
        afterTradeList,
        "trade_realtime_debounce_unsubscribe_count"
      ),
      trade_memory_heap_used_mb:
        pickMs(finalSnap, "trade_memory_heap_used_mb") ?? pickMs(afterMobile, "trade_memory_heap_used_mb"),
      capturedAt: new Date().toISOString(),
      origin,
      scenarios: {
        loggedIn: true,
        hasPost,
        tradeRowCount: await tradeRows.count().catch(() => 0),
        afterSendRecorded: afterSend !== afterTradeList,
      },
    };

    const outDir = path.join(process.cwd(), "tests", "e2e", ".artifacts");
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, "trade-c2c-baseline.json");
    fs.writeFileSync(outPath, JSON.stringify({ trade_c2c_baseline: metrics }, null, 2), "utf8");

    // eslint-disable-next-line no-console
    console.log("\n=== TRADE_C2C_BASELINE_JSON ===\n" + JSON.stringify({ trade_c2c_baseline: metrics }, null, 2) + "\n=== END ===\n");
    // eslint-disable-next-line no-console
    console.log(`[trade-c2c-baseline] wrote ${outPath}`);

    expect(afterMarket, "debug snapshot API").not.toBeNull();
    if (metrics.trade_list_total_ms == null) {
      // eslint-disable-next-line no-console
      console.warn("[trade-c2c-baseline] trade_list_total_ms missing — debug 플래그·/market 렌더 확인");
    }
  });
});
