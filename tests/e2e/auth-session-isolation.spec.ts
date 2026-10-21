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
  /**
   * BUNDLE 4 · P0-2 — 같은 브라우저 2탭: 탭1 A 명시 로그아웃 → 탭2 는 explicit_logout broadcast 로
   * 같은 wipe + post-logout 하드 이동 (sessionStorage 거래 초안·메신저 first-paint 캐시 공백).
   * 이어서 탭1 B 로그인 후 탭2 에 A 상태가 없어야 한다.
   */
  test("2 tabs: A logout in tab1 reloads tab2 and clears its sessionStorage; B login shows no A state", async (
    { page, request },
    testInfo,
  ) => {
    test.setTimeout(180_000);
    await assertPlaywrightOriginReachable(request);
    const skipReason = resolveE2eAccountSwitchSkipReason();
    if (skipReason) {
      test.skip(true, skipReason);
      return;
    }
    const origin = playwrightOriginFromEnv();
    const tab2 = await page.context().newPage();
    try {
      await loginAccountA(page);
      await gotoWithRetry(tab2, `${origin}/community-messenger`);
      await tab2.evaluate(() => {
        window.sessionStorage.setItem(
          "samarket:trade-write-form:v1:e2e-cat",
          JSON.stringify({ v: 1, categoryId: "e2e-cat", title: "A draft", ownerUserId: "a" }),
        );
        window.sessionStorage.setItem("samarket:e2e_tab2_marker", "A");
      });
      const tab2NavigatedAway = tab2.waitForURL(/\/login(\?|$)/, { timeout: 30_000 });

      await logoutAccountA(page);

      await tab2NavigatedAway;
      expect(tab2.url()).toMatch(/reason=logout/);
      const tab2Session = await tab2.evaluate(() => ({
        draft: window.sessionStorage.getItem("samarket:trade-write-form:v1:e2e-cat"),
        marker: window.sessionStorage.getItem("samarket:e2e_tab2_marker"),
        messengerBoot: window.sessionStorage.getItem("samarket.messenger.bootstrap.v1"),
        bound: window.localStorage.getItem("dibay:auth_bound_user_id"),
      }));
      expect(tab2Session.draft).toBeNull();
      expect(tab2Session.marker).toBeNull();
      expect(tab2Session.messengerBoot).toBeNull();
      expect(tab2Session.bound).toBeNull();

      await loginAccountB(page);
      const accountBLabel = await fetchE2eProfileLabel(page, origin);
      await gotoWithRetry(tab2, `${origin}/community-messenger`);
      const accountBLabelInTab2 = await fetchE2eProfileLabel(tab2, origin);
      expect(accountBLabelInTab2).toBe(accountBLabel);
      const staleDraft = await tab2.evaluate(() =>
        window.sessionStorage.getItem("samarket:trade-write-form:v1:e2e-cat"),
      );
      expect(staleDraft).toBeNull();
    } catch (error) {
      const dump = await dumpAuthBrowserState(tab2);
      await testInfo.attach("tab2-auth-state-dump", {
        body: JSON.stringify(dump, null, 2),
        contentType: "application/json",
      });
      throw error;
    } finally {
      await tab2.close();
    }
  });
});
