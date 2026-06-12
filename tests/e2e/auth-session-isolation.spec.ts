/**
 * 계정 세션 격리 E2E — 로그아웃·미인증 private URL·fresh login landing.
 *
 * 실행: `npm run dev` 후 `npx playwright test tests/e2e/auth-session-isolation.spec.ts`
 */
import { expect, test } from "@playwright/test";
import {
  assertPlaywrightOriginReachable,
  ensureE2eUserSession,
  gotoWithRetry,
  playwrightOriginFromEnv,
} from "./helpers/playwright-origin-and-session";

test.describe("auth session isolation", () => {
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
    await gotoWithRetry(page, `${origin}/my/logout`);
    await page.getByRole("button", { name: /로그아웃|sign out/i }).click({ timeout: 15_000 }).catch(() => {});
    await page.waitForURL((url) => url.pathname === "/" || url.pathname === "/login", { timeout: 20_000 });
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
    await gotoWithRetry(page, `${origin}/my/logout`);
    const logoutBtn = page.getByRole("button", { name: /로그아웃|sign out/i });
    if (await logoutBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await logoutBtn.click();
    }
    await page.waitForURL((url) => url.pathname === "/" || url.pathname === "/login", { timeout: 25_000 });
    await page.goBack();
    await page.waitForTimeout(800);
    expect(page.url()).not.toMatch(/\/community-messenger\/rooms\//);
  });

  test("fresh login ignores deep link next in URL bar after sanitize", async ({ page, request }) => {
    await assertPlaywrightOriginReachable(request);
    const origin = playwrightOriginFromEnv();
    await gotoWithRetry(
      page,
      `${origin}/login?next=${encodeURIComponent("/community-messenger/rooms/secret-room")}`
    );
    const nextParam = new URL(page.url()).searchParams.get("next");
    if (nextParam) {
      expect(decodeURIComponent(nextParam)).not.toMatch(/\/community-messenger\/rooms\//);
    }
  });
});
