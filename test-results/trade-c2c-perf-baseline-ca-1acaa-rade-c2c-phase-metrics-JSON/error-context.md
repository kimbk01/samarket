# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: trade-c2c-perf-baseline-capture.spec.ts >> trade c2c perf baseline capture >> capture trade_c2c phase metrics JSON
- Location: tests\e2e\trade-c2c-perf-baseline-capture.spec.ts:75:7

# Error details

```
Error: public /market trade_list_total_ms

expect(received).not.toBeNull()

Received: null
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e3]:
    - heading "dibaY 로그인" [level=1] [ref=e4]
    - paragraph [ref=e5]: 관리자 설정에 따라 로그인 방식이 표시됩니다.
    - generic [ref=e7]:
      - button "Google로 계속하기" [ref=e8]
      - button "Kakao로 계속하기" [ref=e9]
    - generic [ref=e12]: 또는 아이디/비밀번호
    - generic [ref=e14]:
      - group [ref=e15]:
        - generic [ref=e16]:
          - generic [ref=e17]: 이메일 또는 로그인 ID
          - textbox "이메일 또는 로그인 ID" [ref=e18]
        - generic [ref=e19]:
          - generic [ref=e20]: 비밀번호
          - textbox [ref=e21]
      - button "로그인" [ref=e22]
  - alert [ref=e23]
```

# Test source

```ts
  44  | 
  45  | type Snap = { appWidePhaseLastMs?: Record<string, number> };
  46  | 
  47  | function pickMs(s: Snap | null, key: string): number | null {
  48  |   const v = s?.appWidePhaseLastMs?.[key];
  49  |   return typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null;
  50  | }
  51  | 
  52  | async function readSnap(page: import("@playwright/test").Page): Promise<Snap | null> {
  53  |   return page.evaluate(() => {
  54  |     const w = window as unknown as { getMessengerHomeVerificationSnapshot?: () => Snap };
  55  |     return w.getMessengerHomeVerificationSnapshot?.() ?? null;
  56  |   });
  57  | }
  58  | 
  59  | async function waitPaint(page: import("@playwright/test").Page, ms = 500): Promise<void> {
  60  |   await page.waitForTimeout(ms);
  61  | }
  62  | 
  63  | test.describe("trade c2c perf baseline capture", () => {
  64  |   test.beforeEach(async ({ context, page }) => {
  65  |     await setAppLanguageOnPage(page, "ko");
  66  |     await context.addInitScript(() => {
  67  |       try {
  68  |         sessionStorage.setItem("samarket:debug:runtime", "1");
  69  |       } catch {
  70  |         /* ignore */
  71  |       }
  72  |     });
  73  |   });
  74  | 
  75  |   test("capture trade_c2c phase metrics JSON", async ({ page, baseURL }) => {
  76  |     test.setTimeout(420_000);
  77  |     const origin = (baseURL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
  78  | 
  79  |     await assertPlaywrightOriginReachable(page.request);
  80  |     const loginUser = process.env.E2E_TEST_USERNAME?.trim() || "qqqq";
  81  |     const loginPass = process.env.E2E_TEST_PASSWORD ?? "1234";
  82  |     let loggedIn = false;
  83  |     try {
  84  |       await loginForTradeBaseline(page, origin, loginUser, loginPass);
  85  |       loggedIn = true;
  86  |     } catch (loginErr) {
  87  |       // eslint-disable-next-line no-console
  88  |       console.warn(`[trade-c2c-baseline] UI 로그인 스킵 — ${String(loginErr).slice(0, 120)}`);
  89  |     }
  90  |     await page.setViewportSize({ width: 390, height: 844 });
  91  | 
  92  |     // 1. /market
  93  |     await gotoWithRetry(page, `${origin}/market`);
  94  |     await waitPaint(page, 2800);
  95  |     const afterMarket = await readSnap(page);
  96  | 
  97  |     // 2. 상품 상세
  98  |     const postLink = page.locator('a[href^="/post/"]').first();
  99  |     let afterDetail: Snap | null = afterMarket;
  100 |     const hasPost = await postLink.isVisible({ timeout: 20_000 }).catch(() => false);
  101 |     if (hasPost) {
  102 |       await postLink.click();
  103 |       await page.waitForURL(/\/post\//, { timeout: 45_000 });
  104 |       await waitPaint(page, 1800);
  105 |       afterDetail = await readSnap(page);
  106 | 
  107 |       // 3. 채팅하기 (또는 이어가기)
  108 |       const chatBtn = page.getByRole("button", { name: /채팅하기|채팅 이어가기|Chat/i }).first();
  109 |       if (await chatBtn.isVisible({ timeout: 8_000 }).catch(() => false)) {
  110 |         await chatBtn.click();
  111 |         await Promise.race([
  112 |           page.waitForURL(/\/community-messenger\/rooms\//, { timeout: 45_000 }),
  113 |           page.waitForURL(/\/mypage\/trade\/chat\/compose/, { timeout: 45_000 }),
  114 |           page.waitForURL(/\/community-messenger/, { timeout: 45_000 }),
  115 |         ]).catch(() => undefined);
  116 |         await waitPaint(page, 2000);
  117 |       }
  118 |     }
  119 |     const afterChatOpen = await readSnap(page);
  120 | 
  121 |     // 4–7. trade-chats 목록 → 방 → 송수신 → 나가기 → 재진입
  122 |     if (!loggedIn) {
  123 |       const metricsPublic = {
  124 |         trade_list_total_ms: pickMs(afterMarket, "trade_list_total_ms"),
  125 |         trade_list_payload_bytes: pickMs(afterMarket, "trade_list_payload_bytes"),
  126 |         trade_detail_total_ms: pickMs(afterDetail, "trade_detail_total_ms"),
  127 |         trade_chat_open_total_ms: null,
  128 |         trade_chat_bootstrap_ms: null,
  129 |         trade_chat_duplicate_room_guard_ms: null,
  130 |         trade_realtime_subscribe_count: null,
  131 |         trade_realtime_unsubscribe_count: null,
  132 |         trade_realtime_debounce_unsubscribe_count: null,
  133 |         trade_memory_heap_used_mb: pickMs(afterMarket, "trade_memory_heap_used_mb"),
  134 |         capturedAt: new Date().toISOString(),
  135 |         origin,
  136 |         scenarios: { loggedIn: false, hasPost, note: "chat/realtime require auth" },
  137 |       };
  138 |       const outDir = path.join(process.cwd(), "tests", "e2e", ".artifacts");
  139 |       fs.mkdirSync(outDir, { recursive: true });
  140 |       const outPath = path.join(outDir, "trade-c2c-baseline.json");
  141 |       fs.writeFileSync(outPath, JSON.stringify({ trade_c2c_baseline: metricsPublic }, null, 2), "utf8");
  142 |       // eslint-disable-next-line no-console
  143 |       console.log("\n=== TRADE_C2C_BASELINE_JSON (public-only) ===\n" + JSON.stringify({ trade_c2c_baseline: metricsPublic }, null, 2));
> 144 |       expect(metricsPublic.trade_list_total_ms, "public /market trade_list_total_ms").not.toBeNull();
      |                                                                                           ^ Error: public /market trade_list_total_ms
  145 |       return;
  146 |     }
  147 | 
  148 |     await gotoWithRetry(page, `${origin}/community-messenger/trade-chats`);
  149 |     await waitPaint(page, 2200);
  150 |     const tradeRows = page.locator('[data-messenger-chat-row="true"]');
  151 |     await tradeRows.first().waitFor({ state: "visible", timeout: 90_000 }).catch(() => undefined);
  152 |     await waitPaint(page, 1500);
  153 |     const afterTradeList = await readSnap(page);
  154 | 
  155 |     const firstRowTap = tradeRows.first().locator('div[role="button"]').first();
  156 |     let afterRoom: Snap | null = afterTradeList;
  157 |     let afterSend: Snap | null = afterTradeList;
  158 |     if (await firstRowTap.isVisible({ timeout: 5_000 }).catch(() => false)) {
  159 |       await firstRowTap.click();
  160 |       await page.waitForURL(/\/community-messenger\/rooms\//, { timeout: 45_000 }).catch(() => undefined);
  161 |       await waitPaint(page, 1200);
  162 |       afterRoom = await readSnap(page);
  163 | 
  164 |       const ta = page.locator("textarea").first();
  165 |       if (await ta.isVisible({ timeout: 12_000 }).catch(() => false)) {
  166 |         const probe = `baseline-${Date.now()}`;
  167 |         await ta.fill(probe);
  168 |         const sendBtn = page.getByRole("button", { name: /^전송$|^Send$/i }).first();
  169 |         if (await sendBtn.isVisible().catch(() => false)) {
  170 |           await sendBtn.click();
  171 |           await waitPaint(page, 600);
  172 |         }
  173 |         afterSend = await readSnap(page);
  174 |       }
  175 | 
  176 |       await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => undefined);
  177 |       await tradeRows.first().waitFor({ state: "visible", timeout: 45_000 }).catch(() => undefined);
  178 |       await waitPaint(page, 900);
  179 | 
  180 |       if (await firstRowTap.isVisible().catch(() => false)) {
  181 |         await firstRowTap.click();
  182 |         await page.waitForURL(/\/community-messenger\/rooms\//, { timeout: 45_000 }).catch(() => undefined);
  183 |         await waitPaint(page, 900);
  184 |       }
  185 |     }
  186 |     const afterReenter = await readSnap(page);
  187 | 
  188 |     // 8. ko/en
  189 |     await setAppLanguageOnPage(page, "en");
  190 |     await gotoWithRetry(page, `${origin}/market`);
  191 |     await waitPaint(page, 1200);
  192 |     await setAppLanguageOnPage(page, "ko");
  193 |     await waitPaint(page, 400);
  194 | 
  195 |     // 9. 모바일 폭 재확인 (이미 390px)
  196 |     await page.setViewportSize({ width: 390, height: 844 });
  197 |     await gotoWithRetry(page, `${origin}/market`);
  198 |     await waitPaint(page, 1000);
  199 |     const afterMobile = await readSnap(page);
  200 | 
  201 |     await page.evaluate(() => {
  202 |       const g = globalThis as typeof globalThis & {
  203 |         performance?: Performance & { memory?: { usedJSHeapSize?: number } };
  204 |       };
  205 |       const used = g.performance?.memory?.usedJSHeapSize;
  206 |       if (typeof used === "number" && Number.isFinite(used)) {
  207 |         const mb = used / (1024 * 1024);
  208 |         const key = "__samarketAppWidePhaseLastMs" as const;
  209 |         const bag = (g as Record<string, Record<string, number>>)[key] ?? {};
  210 |         bag.trade_memory_heap_used_mb = Math.round(mb * 10) / 10;
  211 |         (g as Record<string, Record<string, number>>)[key] = bag;
  212 |       }
  213 |     });
  214 | 
  215 |     const finalSnap = await readSnap(page);
  216 | 
  217 |     const metrics = {
  218 |       trade_list_total_ms: pickMs(afterMarket, "trade_list_total_ms"),
  219 |       trade_list_payload_bytes: pickMs(afterMarket, "trade_list_payload_bytes"),
  220 |       trade_detail_total_ms: pickMs(afterDetail, "trade_detail_total_ms"),
  221 |       trade_chat_open_total_ms: pickMs(afterChatOpen, "trade_chat_open_total_ms"),
  222 |       trade_chat_bootstrap_ms: pickMs(afterChatOpen, "trade_chat_bootstrap_ms"),
  223 |       trade_chat_duplicate_room_guard_ms: pickMs(afterReenter, "trade_chat_duplicate_room_guard_ms"),
  224 |       trade_realtime_subscribe_count: pickMs(afterTradeList, "trade_realtime_subscribe_count"),
  225 |       trade_realtime_unsubscribe_count: pickMs(afterTradeList, "trade_realtime_unsubscribe_count"),
  226 |       trade_realtime_debounce_unsubscribe_count: pickMs(
  227 |         afterTradeList,
  228 |         "trade_realtime_debounce_unsubscribe_count"
  229 |       ),
  230 |       trade_memory_heap_used_mb:
  231 |         pickMs(finalSnap, "trade_memory_heap_used_mb") ?? pickMs(afterMobile, "trade_memory_heap_used_mb"),
  232 |       capturedAt: new Date().toISOString(),
  233 |       origin,
  234 |       scenarios: {
  235 |         loggedIn: true,
  236 |         hasPost,
  237 |         tradeRowCount: await tradeRows.count().catch(() => 0),
  238 |         afterSendRecorded: afterSend !== afterTradeList,
  239 |       },
  240 |     };
  241 | 
  242 |     const outDir = path.join(process.cwd(), "tests", "e2e", ".artifacts");
  243 |     fs.mkdirSync(outDir, { recursive: true });
  244 |     const outPath = path.join(outDir, "trade-c2c-baseline.json");
```