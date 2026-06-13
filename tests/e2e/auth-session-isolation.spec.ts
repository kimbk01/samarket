/**
 * 계정 세션 격리 E2E — 로그아웃·미인증 private URL·A→B 전환.
 *
 * 실행:
 *   npm run dev
 *   PLAYWRIGHT_NO_WEBSERVER=1 npx playwright test tests/e2e/auth-session-isolation.spec.ts
 *
 * A→B:
 *   E2E_TEST_USERNAME / E2E_TEST_PASSWORD / E2E_TEST_USERNAME_B / E2E_TEST_PASSWORD_B
 */
import { expect, test } from "@playwright/test";
import {
  loginAccountA,
  loginAccountB,
  logoutAccountA,
  resolveE2eAccountSwitchSkipReason,
  seedAccountAVisibleState,
  visitAccountAPrivateUrlsAsB,
} from "./helpers/auth-account-switch-e2e";
import { assertLogoutViaUiSucceeded, dumpAuthBrowserState, performLogoutViaUi } from "./helpers/auth-logout-e2e";
import {
  assertPlaywrightOriginReachable,
  ensureE2eUserSession,
  fetchE2eProfileLabel,
  gotoWithRetry,
  playwrightOriginFromEnv,
} from "./helpers/playwright-origin-and-session";

test.describe("auth session isolation", () => {
  test.describe.configure({ mode: "serial" });
  test("unauthenticated private room URL redirects to login", async ({ page, request }) => {
    await assertPlaywrightOriginReachable(request);
    const origin = playwrightOriginFromEnv();
    const res = await page.goto(`${origin}/community-messenger/rooms/e2e-private-room`, {
      waitUntil: "domcontentloaded",
    });
    expect(page.url()).toMatch(/\/login(\?|$)/);
    expect(page.url()).toMatch(/reason=(auth_required|session_expired)/);
    void res;
  });

  test("logout clears local bound user and returns to safe route", async ({ page, request }) => {
    await assertPlaywrightOriginReachable(request);
    try {
      await ensureE2eUserSession(page);
    } catch {
      test.skip(true, "E2E login unavailable");
      return;
    }
    const origin = playwrightOriginFromEnv();
    await gotoWithRetry(page, `${origin}/community-messenger`);
    await page.evaluate(() => {
      window.localStorage.setItem("dibay:auth_bound_user_id", "stale-user");
      window.localStorage.setItem("samarket:fake_last_route", "/community-messenger/rooms/old");
    });

    const result = await performLogoutViaUi(page, { path: "/my/logout" });
    if (!result.ok) {
      const dump = await dumpAuthBrowserState(page);
      throw new Error(`logout helper FAIL (not product): ${JSON.stringify({ result, dump })}`);
    }

    const bound = await page.evaluate(() => window.localStorage.getItem("dibay:auth_bound_user_id"));
    const fakeRoute = await page.evaluate(() => window.localStorage.getItem("samarket:fake_last_route"));
    expect(bound).toBeNull();
    expect(fakeRoute).toBeNull();
  });

  test("login page shows session expired notice from reason query", async ({ page, request }) => {
    await assertPlaywrightOriginReachable(request);
    const origin = playwrightOriginFromEnv();
    await gotoWithRetry(page, `${origin}/login?reason=session_expired`);
    await expect(page.getByText(/만료|expired/i).first()).toBeVisible({ timeout: 10_000 });
    expect(page.url()).not.toContain("community-messenger/rooms/");
  });

  test("logout from private room does not allow history back to room", async ({ page, request }) => {
    await assertPlaywrightOriginReachable(request);
    try {
      await ensureE2eUserSession(page);
    } catch {
      test.skip(true, "E2E login unavailable");
      return;
    }
    const origin = playwrightOriginFromEnv();
    await gotoWithRetry(page, `${origin}/community-messenger`);
    await page.evaluate(() => {
      history.pushState({}, "", "/community-messenger/rooms/e2e-back-guard-room");
    });

    await assertLogoutViaUiSucceeded(page, { path: "/mypage/logout" });

    await page.goBack();
    await page.waitForTimeout(800);
    expect(page.url()).not.toMatch(/\/community-messenger\/rooms\//);
  });

  test("login page preserves next query until post-login sanitize", async ({ page, request }) => {
    await assertPlaywrightOriginReachable(request);
    const origin = playwrightOriginFromEnv();
    await gotoWithRetry(
      page,
      `${origin}/login?next=${encodeURIComponent("/community-messenger/rooms/secret-room")}`
    );
    const nextParam = new URL(page.url()).searchParams.get("next");
    expect(nextParam).toBeTruthy();
    expect(decodeURIComponent(nextParam!)).toContain("/community-messenger/rooms/");
  });

  test("logout then direct private room URL redirects to login", async ({ page, request }) => {
    await assertPlaywrightOriginReachable(request);
    try {
      await ensureE2eUserSession(page);
    } catch {
      test.skip(true, "E2E login unavailable");
      return;
    }
    const origin = playwrightOriginFromEnv();
    await assertLogoutViaUiSucceeded(page, { path: "/mypage/logout" });

    await page.goto(`${origin}/community-messenger/rooms/e2e-post-logout-room`, {
      waitUntil: "domcontentloaded",
    });
    expect(page.url()).toMatch(/\/login(\?|$)/);
    expect(page.url()).toMatch(/reason=(auth_required|session_expired)/);
  });

  test("A logout B login does not expose A private data", async ({ page, request }, testInfo) => {
    test.setTimeout(180_000);
    await assertPlaywrightOriginReachable(request);
    const skipReason = resolveE2eAccountSwitchSkipReason();
    if (skipReason) {
      test.skip(true, skipReason);
      return;
    }

    try {
      const ctx = await loginAccountA(page);
      await seedAccountAVisibleState(page, ctx);
      await logoutAccountA(page);

      await page.goBack();
      await page.waitForTimeout(800);
      expect(page.url()).not.toMatch(/\/community-messenger\/rooms\//);

      await loginAccountB(page);
      const origin = playwrightOriginFromEnv();
      const accountBLabel = await fetchE2eProfileLabel(page, origin);

      await visitAccountAPrivateUrlsAsB(page, ctx, accountBLabel);

      const staleMarker = await page.evaluate(() => window.localStorage.getItem("samarket:fake_a_nickname"));
      expect(staleMarker).toBeNull();

      await testInfo.attach("post-ab-switch-url", { body: page.url(), contentType: "text/plain" });
    } catch (error) {
      const dump = await dumpAuthBrowserState(page);
      await testInfo.attach("auth-state-dump", {
        body: JSON.stringify(dump, null, 2),
        contentType: "application/json",
      });
      throw error;
    }
  });
});
