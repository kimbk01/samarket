# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dibay-session-policy.spec.ts >> dibay session policy >> settings shows logout all devices menu row when logged in
- Location: tests/e2e/dibay-session-policy.spec.ts:68:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText(/모든 기기|all devices/i).first()
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for getByText(/모든 기기|all devices/i).first()

```

# Page snapshot

```yaml
- alert [ref=e5]
```

# Test source

```ts
  1  | /**
  2  |  * DIBAY 세션 정책 E2E — refresh 유지·logout 분리·guest vs expired.
  3  |  *
  4  |  * 실행: `npm run dev` 후 `npx playwright test tests/e2e/dibay-session-policy.spec.ts`
  5  |  */
  6  | import { expect, test } from "@playwright/test";
  7  | import {
  8  |   assertPlaywrightOriginReachable,
  9  |   ensureE2eUserSession,
  10 |   gotoWithRetry,
  11 |   playwrightOriginFromEnv,
  12 | } from "./helpers/playwright-origin-and-session";
  13 | 
  14 | test.describe("dibay session policy", () => {
  15 |   test("refresh keeps login on mypage reload", async ({ page, request }) => {
  16 |     await assertPlaywrightOriginReachable(request);
  17 |     try {
  18 |       await ensureE2eUserSession(page);
  19 |     } catch {
  20 |       test.skip(true, "E2E login unavailable");
  21 |       return;
  22 |     }
  23 |     const origin = playwrightOriginFromEnv();
  24 |     await gotoWithRetry(page, `${origin}/mypage`);
  25 |     await page.reload({ waitUntil: "domcontentloaded" });
  26 |     await page.waitForTimeout(800);
  27 |     expect(page.url()).toMatch(/\/mypage/);
  28 |     expect(page.url()).not.toMatch(/reason=session_expired/);
  29 |   });
  30 | 
  31 |   test("login page auth_required vs session_expired reasons differ", async ({ page, request }) => {
  32 |     await assertPlaywrightOriginReachable(request);
  33 |     const origin = playwrightOriginFromEnv();
  34 |     await gotoWithRetry(page, `${origin}/login?reason=auth_required`);
  35 |     await expect(page.getByText(/로그인이 필요|sign in/i).first()).toBeVisible({ timeout: 10_000 });
  36 | 
  37 |     await gotoWithRetry(page, `${origin}/login?reason=session_expired`);
  38 |     await expect(page.getByText(/만료|expired/i).first()).toBeVisible({ timeout: 10_000 });
  39 |   });
  40 | 
  41 |   test("unauthenticated private URL uses auth_required not session_expired only", async ({ page, request }) => {
  42 |     await assertPlaywrightOriginReachable(request);
  43 |     const origin = playwrightOriginFromEnv();
  44 |     await page.goto(`${origin}/mypage/settings`, { waitUntil: "domcontentloaded" });
  45 |     expect(page.url()).toMatch(/\/login/);
  46 |     expect(page.url()).toMatch(/reason=(auth_required|session_expired)/);
  47 |   });
  48 | 
  49 |   test("logout clears bound user id", async ({ page, request }) => {
  50 |     await assertPlaywrightOriginReachable(request);
  51 |     try {
  52 |       await ensureE2eUserSession(page);
  53 |     } catch {
  54 |       test.skip(true, "E2E login unavailable");
  55 |       return;
  56 |     }
  57 |     const origin = playwrightOriginFromEnv();
  58 |     await gotoWithRetry(page, `${origin}/my/logout`);
  59 |     const logoutBtn = page.getByRole("button", { name: /로그아웃|sign out/i }).first();
  60 |     if (await logoutBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
  61 |       await logoutBtn.click();
  62 |     }
  63 |     await page.waitForURL((url) => url.pathname === "/" || url.pathname === "/login", { timeout: 25_000 });
  64 |     const bound = await page.evaluate(() => window.localStorage.getItem("dibay:auth_bound_user_id"));
  65 |     expect(bound).toBeNull();
  66 |   });
  67 | 
  68 |   test("settings shows logout all devices menu row when logged in", async ({ page, request }) => {
  69 |     await assertPlaywrightOriginReachable(request);
  70 |     try {
  71 |       await ensureE2eUserSession(page);
  72 |     } catch {
  73 |       test.skip(true, "E2E login unavailable");
  74 |       return;
  75 |     }
  76 |     const origin = playwrightOriginFromEnv();
  77 |     await gotoWithRetry(page, `${origin}/my/logout`);
> 78 |     await expect(page.getByText(/모든 기기|all devices/i).first()).toBeVisible({ timeout: 10_000 });
     |                                                                ^ Error: expect(locator).toBeVisible() failed
  79 |   });
  80 | });
  81 | 
```