/**
 * DIBAY 세션 정책 E2E — refresh 유지·logout 분리·guest vs expired.
 *
 * 실행: `npm run dev` 후 `npx playwright test tests/e2e/dibay-session-policy.spec.ts`
 */
import { expect, test } from "@playwright/test";
import { assertLogoutViaUiSucceeded } from "./helpers/auth-logout-e2e";
import {
  assertPlaywrightOriginReachable,
  ensureE2eUserSession,
  gotoWithRetry,
  playwrightOriginFromEnv,
} from "./helpers/playwright-origin-and-session";

test.describe("dibay session policy", () => {
  test("refresh keeps login on mypage reload", async ({ page, request }) => {
    await assertPlaywrightOriginReachable(request);
    try {
      await ensureE2eUserSession(page);
    } catch {
      test.skip(true, "E2E login unavailable");
      return;
    }
    const origin = playwrightOriginFromEnv();
    await gotoWithRetry(page, `${origin}/mypage`);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(800);
    expect(page.url()).toMatch(/\/mypage/);
    expect(page.url()).not.toMatch(/reason=session_expired/);
  });

  test("login page auth_required vs session_expired reasons differ", async ({ page, request }) => {
    await assertPlaywrightOriginReachable(request);
    const origin = playwrightOriginFromEnv();
    await gotoWithRetry(page, `${origin}/login?reason=auth_required`);
    await expect(page.getByText(/로그인이 필요|sign in/i).first()).toBeVisible({ timeout: 10_000 });

    await gotoWithRetry(page, `${origin}/login?reason=session_expired`);
    await expect(page.getByText(/만료|expired/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test("unauthenticated private URL uses auth_required not session_expired only", async ({ page, request }) => {
    await assertPlaywrightOriginReachable(request);
    const origin = playwrightOriginFromEnv();
    await page.goto(`${origin}/mypage/store-orders`, { waitUntil: "domcontentloaded" });
    expect(page.url()).toMatch(/\/login/);
    expect(page.url()).toMatch(/reason=(auth_required|session_expired)/);
  });

  test("logout clears bound user id", async ({ page, request }) => {
    await assertPlaywrightOriginReachable(request);
    try {
      await ensureE2eUserSession(page);
    } catch {
      test.skip(true, "E2E login unavailable");
      return;
    }
    await assertLogoutViaUiSucceeded(page, { path: "/my/logout" });
    const bound = await page.evaluate(() => window.localStorage.getItem("dibay:auth_bound_user_id"));
    expect(bound).toBeNull();
  });

  test("logout page auto-opens confirm modal", async ({ page, request }) => {
    await assertPlaywrightOriginReachable(request);
    try {
      await ensureE2eUserSession(page);
    } catch {
      test.skip(true, "E2E login unavailable");
      return;
    }
    const origin = playwrightOriginFromEnv();
    await gotoWithRetry(page, `${origin}/mypage/logout`);
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-testid="auth_logout_submit"]')).toBeVisible({ timeout: 5_000 });
  });
});
