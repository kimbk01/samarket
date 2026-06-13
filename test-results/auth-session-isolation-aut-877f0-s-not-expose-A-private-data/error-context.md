# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth-session-isolation.spec.ts >> auth session isolation >> A logout B login does not expose A private data
- Location: tests/e2e/auth-session-isolation.spec.ts:128:7

# Error details

```
Error: [E2E logout] confirm modal not ready — url=http://localhost:3000/mypage/logout title=dibaY
```

# Test source

```ts
  1   | import { expect, type Page } from "@playwright/test";
  2   | import { gotoWithRetry, playwrightOriginFromEnv } from "./playwright-origin-and-session";
  3   | 
  4   | export type LogoutViaUiPath = "/my/logout" | "/mypage/logout";
  5   | 
  6   | export type LogoutViaUiSuccessVia =
  7   |   | "url_redirect"
  8   |   | "api_logout"
  9   |   | "session_null"
  10  |   | "bound_user_cleared";
  11  | 
  12  | export type LogoutViaUiResult = {
  13  |   ok: boolean;
  14  |   via: LogoutViaUiSuccessVia | "timeout";
  15  |   finalUrl: string;
  16  |   logoutApiStatus?: number;
  17  |   boundUserId: string | null;
  18  | };
  19  | 
  20  | const LOGOUT_SUCCESS_PATH = /^\/$|^\/login(\/|$)/;
  21  | 
  22  | function isPublicLandingPath(pathname: string): boolean {
  23  |   return LOGOUT_SUCCESS_PATH.test(pathname);
  24  | }
  25  | 
  26  | async function readBoundUserId(page: Page): Promise<string | null | "navigation"> {
  27  |   try {
  28  |     return await page.evaluate(() => window.localStorage.getItem("dibay:auth_bound_user_id"));
  29  |   } catch {
  30  |     return "navigation";
  31  |   }
  32  | }
  33  | 
  34  | async function isAuthenticatedSession(page: Page, origin: string): Promise<boolean> {
  35  |   const res = await page.request.get(`${origin}/api/me/settings`).catch(() => null);
  36  |   return res?.ok() === true;
  37  | }
  38  | 
  39  | /** confirm 모달 내 submit 버튼 — 배경 버튼과 구분 */
  40  | export async function clickLogoutConfirmButton(page: Page): Promise<void> {
  41  |   const submit = page.locator('[data-testid="auth_logout_submit"]');
  42  |   const dialog = page.getByRole("dialog");
  43  | 
  44  |   async function waitForModal(timeoutMs: number): Promise<boolean> {
  45  |     await page.waitForLoadState("load").catch(() => undefined);
  46  |     return submit
  47  |       .waitFor({ state: "visible", timeout: timeoutMs })
  48  |       .then(() => true)
  49  |       .catch(async () => {
  50  |         if (await dialog.isVisible().catch(() => false)) return true;
  51  |         const row = page.getByRole("button", { name: /로그아웃|Log out|Sign out/i }).first();
  52  |         if (await row.isVisible({ timeout: 3_000 }).catch(() => false)) {
  53  |           await row.click();
  54  |         }
  55  |         await submit.waitFor({ state: "visible", timeout: 10_000 });
  56  |         return true;
  57  |       })
  58  |       .catch(() => false);
  59  |   }
  60  | 
  61  |   let modalReady = await waitForModal(30_000);
  62  |   if (!modalReady && page.url().includes("/mypage/logout")) {
  63  |     await page.reload({ waitUntil: "load" }).catch(() => undefined);
  64  |     modalReady = await waitForModal(30_000);
  65  |   }
  66  | 
  67  |   if (!modalReady) {
> 68  |     throw new Error(
      |           ^ Error: [E2E logout] confirm modal not ready — url=http://localhost:3000/mypage/logout title=dibaY
  69  |       `[E2E logout] confirm modal not ready — url=${page.url()} title=${await page.title().catch(() => "")}`
  70  |     );
  71  |   }
  72  | 
  73  |   const candidates = [
  74  |     submit,
  75  |     dialog.getByRole("button", { name: /^(로그아웃|Sign out)$/i }),
  76  |     dialog.locator('button:has-text("로그아웃")'),
  77  |     dialog.locator('button:has-text("Logout")'),
  78  |     dialog.getByRole("button", { name: /로그아웃|Logout|Sign out/i }),
  79  |   ];
  80  | 
  81  |   for (const locator of candidates) {
  82  |     if (await locator.first().isVisible({ timeout: 500 }).catch(() => false)) {
  83  |       await locator.first().click();
  84  |       return;
  85  |     }
  86  |   }
  87  | 
  88  |   throw new Error(
  89  |     `[E2E logout] confirm button not found — url=${page.url()} dialogVisible=${await dialog.isVisible().catch(() => false)}`
  90  |   );
  91  | }
  92  | 
  93  | /**
  94  |  * 실제 사용자 logout 흐름: logout page → confirm modal → session wipe → public route.
  95  |  * confirm 클릭 없이 timeout 이면 테스트 헬퍼 FAIL (제품 FAIL 아님).
  96  |  */
  97  | export async function performLogoutViaUi(
  98  |   page: Page,
  99  |   opts?: { path?: LogoutViaUiPath; timeoutMs?: number }
  100 | ): Promise<LogoutViaUiResult> {
  101 |   const origin = playwrightOriginFromEnv();
  102 |   const logoutPath = opts?.path ?? "/mypage/logout";
  103 |   const timeoutMs = opts?.timeoutMs ?? 6_000;
  104 | 
  105 |   const logoutApiWait = page
  106 |     .waitForResponse(
  107 |       (res) => res.url().includes("/api/auth/logout") && res.request().method() === "POST",
  108 |       { timeout: timeoutMs + 4_000 }
  109 |     )
  110 |     .catch(() => null);
  111 | 
  112 |   await gotoWithRetry(page, `${origin}${logoutPath}`);
  113 | 
  114 |   if (!page.url().includes("/mypage/logout")) {
  115 |     await gotoWithRetry(page, `${origin}/mypage/logout`);
  116 |   }
  117 | 
  118 |   let logoutApiStatus: number | undefined;
  119 | 
  120 |   await clickLogoutConfirmButton(page);
  121 | 
  122 |   try {
  123 |     await Promise.race([
  124 |       page.waitForURL((url) => isPublicLandingPath(url.pathname), { timeout: timeoutMs }),
  125 |       page
  126 |         .waitForResponse(
  127 |           (res) => res.url().includes("/api/auth/logout") && res.request().method() === "POST",
  128 |           { timeout: timeoutMs }
  129 |         )
  130 |         .then((res) => {
  131 |           logoutApiStatus = res.status();
  132 |         }),
  133 |     ]);
  134 |   } catch {
  135 |     /* poll below */
  136 |   }
  137 | 
  138 |   const logoutApiRes = await logoutApiWait;
  139 |   if (logoutApiStatus == null && logoutApiRes) {
  140 |     logoutApiStatus = logoutApiRes.status();
  141 |   }
  142 | 
  143 |   const deadline = Date.now() + 2_000;
  144 |   while (Date.now() < deadline) {
  145 |     const pathname = new URL(page.url()).pathname;
  146 |     if (isPublicLandingPath(pathname)) {
  147 |       const bound = await readBoundUserId(page);
  148 |       return {
  149 |         ok: true,
  150 |         via: "url_redirect",
  151 |         finalUrl: page.url(),
  152 |         logoutApiStatus,
  153 |         boundUserId: bound === "navigation" ? null : bound,
  154 |       };
  155 |     }
  156 | 
  157 |     const boundUserId = await readBoundUserId(page);
  158 |     if (boundUserId === "navigation") {
  159 |       await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  160 |       continue;
  161 |     }
  162 |     if (!boundUserId) {
  163 |       return {
  164 |         ok: true,
  165 |         via: "bound_user_cleared",
  166 |         finalUrl: page.url(),
  167 |         logoutApiStatus,
  168 |         boundUserId: null,
```