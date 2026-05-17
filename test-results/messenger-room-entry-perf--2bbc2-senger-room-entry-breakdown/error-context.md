# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: messenger-room-entry-perf-breakdown.spec.ts >> messenger room entry perf breakdown >> capture messenger room entry breakdown
- Location: tests\e2e\messenger-room-entry-perf-breakdown.spec.ts:67:7

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
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
  1   | import { expect, test } from "@playwright/test";
  2   | 
  3   | type Snap = {
  4   |   appWidePhaseLastMs?: Record<string, number>;
  5   | };
  6   | 
  7   | function pickNum(s: Snap | null, key: string): number | null {
  8   |   const v = s?.appWidePhaseLastMs?.[key];
  9   |   return typeof v === "number" && Number.isFinite(v) ? v : null;
  10  | }
  11  | 
  12  | async function readSnap(page: import("@playwright/test").Page): Promise<Snap | null> {
  13  |   return page.evaluate(() => {
  14  |     const w = window as unknown as { getMessengerHomeVerificationSnapshot?: () => Snap };
  15  |     return w.getMessengerHomeVerificationSnapshot?.() ?? null;
  16  |   });
  17  | }
  18  | 
  19  | async function testLoginViaFetch(
  20  |   page: import("@playwright/test").Page,
  21  |   baseURL: string,
  22  |   username: string,
  23  |   password: string
  24  | ): Promise<void> {
  25  |   await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  26  |   let ok = false;
  27  |   for (let i = 0; i < 3 && !ok; i += 1) {
  28  |     if (i > 0) await page.waitForTimeout(600);
  29  |     ok = await page.evaluate(
  30  |       async ({ origin, user, pass }) => {
  31  |         try {
  32  |           const res = await fetch(`${origin}/api/test-login`, {
  33  |             method: "POST",
  34  |             headers: { "Content-Type": "application/json" },
  35  |             credentials: "include",
  36  |             body: JSON.stringify({ username: user, password: pass }),
  37  |           });
  38  |           const data = (await res.json()) as { ok?: boolean; userId?: string; username?: string; role?: string };
  39  |           if (!data?.ok || !data.userId || !data.username) return false;
  40  |           sessionStorage.setItem("test_user_id", data.userId);
  41  |           sessionStorage.setItem("test_username", data.username);
  42  |           sessionStorage.setItem("test_role", data.role || "member");
  43  |           document.cookie = `kasama_dev_uid_pub=${encodeURIComponent(data.userId)}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
  44  |           window.dispatchEvent(new Event("kasama-test-auth-changed"));
  45  |           return true;
  46  |         } catch {
  47  |           return false;
  48  |         }
  49  |       },
  50  |       { origin: baseURL, user: username, pass: password }
  51  |     );
  52  |   }
> 53  |   expect(ok).toBe(true);
      |              ^ Error: expect(received).toBe(expected) // Object.is equality
  54  | }
  55  | 
  56  | test.describe("messenger room entry perf breakdown", () => {
  57  |   test.beforeEach(async ({ context }) => {
  58  |     await context.addInitScript(() => {
  59  |       try {
  60  |         sessionStorage.setItem("samarket:debug:runtime", "1");
  61  |       } catch {
  62  |         /* ignore */
  63  |       }
  64  |     });
  65  |   });
  66  | 
  67  |   test("capture messenger room entry breakdown", async ({ page, baseURL }) => {
  68  |     test.setTimeout(240_000);
  69  |     const user = process.env.E2E_TEST_USERNAME?.trim() ?? "";
  70  |     const pass = process.env.E2E_TEST_PASSWORD ?? "";
  71  |     test.skip(!user || !pass, "E2E_TEST_USERNAME / E2E_TEST_PASSWORD 필요");
  72  | 
  73  |     const origin = baseURL ?? "http://127.0.0.1:3000";
  74  |     await testLoginViaFetch(page, origin, user, pass);
  75  | 
  76  |     await page.goto(`${origin}/community-messenger`, { waitUntil: "domcontentloaded" });
  77  |     const roomRow = page.locator('[data-messenger-chat-row="true"]').first();
  78  |     await roomRow.waitFor({ state: "visible", timeout: 60_000 });
  79  |     await roomRow.click();
  80  |     await page.waitForURL(/\/community-messenger\/rooms\//, { timeout: 30_000 });
  81  |     await page.locator("textarea").first().waitFor({ state: "visible", timeout: 30_000 });
  82  |     await expect
  83  |       .poll(
  84  |         async () => {
  85  |           const snap = await readSnap(page);
  86  |           return pickNum(snap, "messenger_room_entry_first_message_render_ms");
  87  |         },
  88  |         { timeout: 15_000 }
  89  |       )
  90  |       .not.toBeNull();
  91  | 
  92  |     await expect
  93  |       .poll(
  94  |         async () => {
  95  |           const snap = await readSnap(page);
  96  |           return pickNum(snap, "messenger_room_entry_composer_textarea_visible_ms");
  97  |         },
  98  |         { timeout: 15_000 }
  99  |       )
  100 |       .not.toBeNull();
  101 | 
  102 |     await expect
  103 |       .poll(
  104 |         async () => {
  105 |           const snap = await readSnap(page);
  106 |           return pickNum(snap, "messenger_room_entry_input_ready_ms");
  107 |         },
  108 |         { timeout: 15_000 }
  109 |       )
  110 |       .not.toBeNull();
  111 | 
  112 |     await expect
  113 |       .poll(
  114 |         async () => {
  115 |           const snap = await readSnap(page);
  116 |           return pickNum(snap, "messenger_room_entry_display_room_messages_ready_ms");
  117 |         },
  118 |         { timeout: 15_000 }
  119 |       )
  120 |       .not.toBeNull();
  121 | 
  122 |     const snap = await readSnap(page);
  123 |     const result = {
  124 |       messenger_room_entry_room_route_enter_ms: pickNum(snap, "messenger_room_entry_room_route_enter_ms"),
  125 |       messenger_room_entry_router_push_called_ms: pickNum(snap, "messenger_room_entry_router_push_called_ms"),
  126 |       messenger_room_entry_next_route_start_ms: pickNum(snap, "messenger_room_entry_next_route_start_ms"),
  127 |       messenger_room_entry_route_module_request_start_ms: pickNum(
  128 |         snap,
  129 |         "messenger_room_entry_route_module_request_start_ms"
  130 |       ),
  131 |       messenger_room_entry_route_module_request_end_ms: pickNum(
  132 |         snap,
  133 |         "messenger_room_entry_route_module_request_end_ms"
  134 |       ),
  135 |       messenger_room_entry_client_chunk_request_start_ms: pickNum(
  136 |         snap,
  137 |         "messenger_room_entry_client_chunk_request_start_ms"
  138 |       ),
  139 |       messenger_room_entry_client_chunk_request_end_ms: pickNum(
  140 |         snap,
  141 |         "messenger_room_entry_client_chunk_request_end_ms"
  142 |       ),
  143 |       messenger_room_entry_page_module_eval_start_ms: pickNum(snap, "messenger_room_entry_page_module_eval_start_ms"),
  144 |       messenger_room_entry_page_module_eval_end_ms: pickNum(snap, "messenger_room_entry_page_module_eval_end_ms"),
  145 |       messenger_room_entry_client_component_module_eval_start_ms: pickNum(
  146 |         snap,
  147 |         "messenger_room_entry_client_component_module_eval_start_ms"
  148 |       ),
  149 |       messenger_room_entry_client_component_module_eval_end_ms: pickNum(
  150 |         snap,
  151 |         "messenger_room_entry_client_component_module_eval_end_ms"
  152 |       ),
  153 |       messenger_room_entry_CommunityMessengerRoomClient_first_import_ready_ms: pickNum(
```