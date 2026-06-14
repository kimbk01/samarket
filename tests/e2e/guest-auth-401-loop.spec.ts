/**
 * DIBAY guest auth 401 loop — 최종 E2E 검증.
 *
 * 실행: `npm run dev` 후
 * `PLAYWRIGHT_NO_WEBSERVER=1 npx playwright test tests/e2e/guest-auth-401-loop.spec.ts`
 */
import { expect, test } from "@playwright/test";
import {
  attachGuestAuthProbe,
  waitForGuestAuthSettle,
} from "./helpers/guest-auth-probe";
import {
  assertPlaywrightOriginReachable,
  ensureE2eUserSession,
  gotoWithRetry,
  playwrightOriginFromEnv,
} from "./helpers/playwright-origin-and-session";

const GUEST_PUBLIC_PATHS = ["/market", "/stores", "/community"] as const;

async function assertGuestBrowseProbe(page: import("@playwright/test").Page, path: string): Promise<void> {
  const origin = playwrightOriginFromEnv();
  const probe = attachGuestAuthProbe(page);

  try {
    await gotoWithRetry(page, `${origin}${path}`);
    await waitForGuestAuthSettle(page);

    const result = probe.read();

    expect(result.guest401Detected, `${path} guest_401_detected`).toBeLessThanOrEqual(1);
    expect(result.guestStateEstablished, `${path} guest_state_established`).toBeLessThanOrEqual(1);
    expect(result.guestStateEstablished, `${path} guest must be established`).toBeGreaterThanOrEqual(1);

    const guestProbe = await page.evaluate(() => {
      const fn = (window as Window & {
        __dibayGuestAuthProbe?: () => { authMissing: boolean; guestEstablishedAt: number };
      }).__dibayGuestAuthProbe;
      return fn?.() ?? null;
    });
    expect(guestProbe?.authMissing, `${path} authMissing`).toBe(true);

    expect(result.authSessionAfterGuest, `${path} /api/auth/session after guest`).toBe(0);
    expect(result.meProfileAfterGuest, `${path} /api/me/profile after guest`).toBe(0);
    expect(result.notificationUnreadAfterGuest, `${path} notification unread after guest`).toBe(0);
    expect(result.authRefreshStartAfterGuest, `${path} auth_refresh_start after guest`).toBe(0);
  } finally {
    probe.dispose();
  }
}

test.describe("guest auth 401 loop fix", () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
    await context.clearPermissions();
  });

  test.describe("guest public browse — zero post-guest auth network", () => {
    for (const path of GUEST_PUBLIC_PATHS) {
      test(`unauthenticated ${path}`, async ({ page, request }) => {
        await assertPlaywrightOriginReachable(request);
        await assertGuestBrowseProbe(page, path);
      });
    }
  });

  test.describe("private routes — login redirect preserved", () => {
    test("/chat redirects to login", async ({ page, request }) => {
      await assertPlaywrightOriginReachable(request);
      const origin = playwrightOriginFromEnv();
      await gotoWithRetry(page, `${origin}/chat`);
      await page.waitForURL(/\/login/, { timeout: 15_000 });
      expect(page.url()).toMatch(/reason=auth_required/);
    });

    test("/admin redirects to login", async ({ page, request }) => {
      await assertPlaywrightOriginReachable(request);
      const origin = playwrightOriginFromEnv();
      await gotoWithRetry(page, `${origin}/admin`);
      await page.waitForURL(/\/login/, { timeout: 15_000 });
      expect(page.url()).toMatch(/reason=auth_required/);
    });

    test("/mypage stays guest shell without member hub unlock", async ({ page, request }) => {
      await assertPlaywrightOriginReachable(request);
      const origin = playwrightOriginFromEnv();
      const probe = attachGuestAuthProbe(page);
      try {
        await gotoWithRetry(page, `${origin}/mypage`);
        await waitForGuestAuthSettle(page);
        expect(page.url()).toMatch(/\/mypage/);
        expect(page.url()).not.toMatch(/\/login/);

        const guestProbe = await page.evaluate(() => {
          return (window as Window & {
            __dibayGuestAuthProbe?: () => { authMissing: boolean; guestEstablishedAt: number };
          }).__dibayGuestAuthProbe?.() ?? null;
        });
        expect(guestProbe?.authMissing).toBe(true);

        const metrics = probe.read();
        expect(metrics.authSessionAfterGuest).toBe(0);
        expect(metrics.meProfileAfterGuest).toBe(0);
      } finally {
        probe.dispose();
      }
    });
  });

  test.describe("login and logout lifecycle", () => {
    test("login clears guest gate and resumes protected fetches", async ({ page, request }) => {
      await assertPlaywrightOriginReachable(request);
      try {
        await ensureE2eUserSession(page);
      } catch {
        test.skip(true, "E2E login unavailable");
        return;
      }

      const origin = playwrightOriginFromEnv();
      await gotoWithRetry(page, `${origin}/mypage`);
      await page.waitForTimeout(2_500);

      const guestAfterLogin = await page.evaluate(() => {
        return (window as Window & {
          __dibayGuestAuthProbe?: () => { authMissing: boolean; guestEstablishedAt: number };
        }).__dibayGuestAuthProbe?.() ?? null;
      });
      expect(guestAfterLogin?.authMissing).toBe(false);

      let profileOk = false;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const profileRes = await page.request.get(`${origin}/api/me/profile?mode=full`).catch(() => null);
        if (profileRes?.ok()) {
          profileOk = true;
          break;
        }
        await page.waitForTimeout(800);
      }
      expect(profileOk).toBe(true);

      let notifOk = false;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const notifRes = await page.request
          .get(`${origin}/api/me/notifications?unread_count_only=1&badge_surface=bottom_nav_my`)
          .catch(() => null);
        if (notifRes && notifRes.status() < 500) {
          notifOk = true;
          break;
        }
        await page.waitForTimeout(800);
      }
      expect(notifOk).toBe(true);

      const membershipGuest = await page.evaluate(() => {
        return (window as Window & {
          __dibayGuestAuthProbe?: () => { authMissing: boolean; guestEstablishedAt: number };
        }).__dibayGuestAuthProbe?.() ?? null;
      });
      expect(membershipGuest?.authMissing).toBe(false);
    });

    test("logout re-establishes guest without refresh loop on /market", async ({ page, request }) => {
      await assertPlaywrightOriginReachable(request);
      try {
        await ensureE2eUserSession(page);
      } catch {
        test.skip(true, "E2E login unavailable");
        return;
      }

      const origin = playwrightOriginFromEnv();
      await gotoWithRetry(page, `${origin}/mypage`);
      await page.waitForTimeout(2_500);
      await page.context().clearCookies();
      await page.evaluate(async () => {
        const reset = (window as Window & { __dibayResetAuthState?: () => Promise<void> }).__dibayResetAuthState;
        if (reset) await reset();
      });

      const probe = attachGuestAuthProbe(page);
      try {
        await gotoWithRetry(page, `${origin}/market`);
        await waitForGuestAuthSettle(page);

        const result = probe.read();
        expect(result.guestStateEstablished).toBeLessThanOrEqual(1);
        expect(result.authSessionAfterGuest).toBe(0);
        expect(result.meProfileAfterGuest).toBe(0);
        expect(result.notificationUnreadAfterGuest).toBe(0);
        expect(result.authRefreshStartAfterGuest).toBe(0);

        const guestProbe = await page.evaluate(() => {
          return (window as Window & {
            __dibayGuestAuthProbe?: () => { authMissing: boolean; guestEstablishedAt: number };
          }).__dibayGuestAuthProbe?.() ?? null;
        });
        expect(guestProbe?.authMissing).toBe(true);
      } finally {
        probe.dispose();
      }
    });
  });
});
