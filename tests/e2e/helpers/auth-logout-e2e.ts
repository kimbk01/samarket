import { expect, type Page } from "@playwright/test";
import { gotoWithRetry, playwrightOriginFromEnv } from "./playwright-origin-and-session";

export type LogoutViaUiPath = "/my/logout" | "/mypage/logout";

export type LogoutViaUiSuccessVia =
  | "url_redirect"
  | "api_logout"
  | "session_null"
  | "bound_user_cleared";

export type LogoutViaUiResult = {
  ok: boolean;
  via: LogoutViaUiSuccessVia | "timeout";
  finalUrl: string;
  logoutApiStatus?: number;
  boundUserId: string | null;
};

const LOGOUT_SUCCESS_PATH = /^\/$|^\/login(\/|$)/;

function isPublicLandingPath(pathname: string): boolean {
  return LOGOUT_SUCCESS_PATH.test(pathname);
}

async function readBoundUserId(page: Page): Promise<string | null | "navigation"> {
  try {
    return await page.evaluate(() => window.localStorage.getItem("dibay:auth_bound_user_id"));
  } catch {
    return "navigation";
  }
}

async function isAuthenticatedSession(page: Page, origin: string): Promise<boolean> {
  const res = await page.request.get(`${origin}/api/me/settings`).catch(() => null);
  return res?.ok() === true;
}

/** confirm 모달 내 submit 버튼 — 배경 버튼과 구분 */
export async function clickLogoutConfirmButton(page: Page): Promise<void> {
  const submit = page.locator('[data-testid="auth_logout_submit"]');
  const dialog = page.getByRole("dialog");

  async function waitForModal(timeoutMs: number): Promise<boolean> {
    await page.waitForLoadState("load").catch(() => undefined);
    return submit
      .waitFor({ state: "visible", timeout: timeoutMs })
      .then(() => true)
      .catch(async () => {
        if (await dialog.isVisible().catch(() => false)) return true;
        const row = page.getByRole("button", { name: /로그아웃|Log out|Sign out/i }).first();
        if (await row.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await row.click();
        }
        await submit.waitFor({ state: "visible", timeout: 10_000 });
        return true;
      })
      .catch(() => false);
  }

  let modalReady = await waitForModal(30_000);
  if (!modalReady && page.url().includes("/mypage/logout")) {
    await page.reload({ waitUntil: "load" }).catch(() => undefined);
    modalReady = await waitForModal(30_000);
  }

  if (!modalReady) {
    throw new Error(
      `[E2E logout] confirm modal not ready — url=${page.url()} title=${await page.title().catch(() => "")}`
    );
  }

  const candidates = [
    submit,
    dialog.getByRole("button", { name: /^(로그아웃|Sign out)$/i }),
    dialog.locator('button:has-text("로그아웃")'),
    dialog.locator('button:has-text("Logout")'),
    dialog.getByRole("button", { name: /로그아웃|Logout|Sign out/i }),
  ];

  for (const locator of candidates) {
    if (await locator.first().isVisible({ timeout: 500 }).catch(() => false)) {
      await locator.first().click();
      return;
    }
  }

  throw new Error(
    `[E2E logout] confirm button not found — url=${page.url()} dialogVisible=${await dialog.isVisible().catch(() => false)}`
  );
}

/**
 * 실제 사용자 logout 흐름: logout page → confirm modal → session wipe → public route.
 * confirm 클릭 없이 timeout 이면 테스트 헬퍼 FAIL (제품 FAIL 아님).
 */
export async function performLogoutViaUi(
  page: Page,
  opts?: { path?: LogoutViaUiPath; timeoutMs?: number }
): Promise<LogoutViaUiResult> {
  const origin = playwrightOriginFromEnv();
  const logoutPath = opts?.path ?? "/mypage/logout";
  const timeoutMs = opts?.timeoutMs ?? 6_000;

  const logoutApiWait = page
    .waitForResponse(
      (res) => res.url().includes("/api/auth/logout") && res.request().method() === "POST",
      { timeout: timeoutMs + 4_000 }
    )
    .catch(() => null);

  await gotoWithRetry(page, `${origin}${logoutPath}`);

  if (!page.url().includes("/mypage/logout")) {
    await gotoWithRetry(page, `${origin}/mypage/logout`);
  }

  let logoutApiStatus: number | undefined;

  await clickLogoutConfirmButton(page);

  try {
    await Promise.race([
      page.waitForURL((url) => isPublicLandingPath(url.pathname), { timeout: timeoutMs }),
      page
        .waitForResponse(
          (res) => res.url().includes("/api/auth/logout") && res.request().method() === "POST",
          { timeout: timeoutMs }
        )
        .then((res) => {
          logoutApiStatus = res.status();
        }),
    ]);
  } catch {
    /* poll below */
  }

  const logoutApiRes = await logoutApiWait;
  if (logoutApiStatus == null && logoutApiRes) {
    logoutApiStatus = logoutApiRes.status();
  }

  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    const pathname = new URL(page.url()).pathname;
    if (isPublicLandingPath(pathname)) {
      const bound = await readBoundUserId(page);
      return {
        ok: true,
        via: "url_redirect",
        finalUrl: page.url(),
        logoutApiStatus,
        boundUserId: bound === "navigation" ? null : bound,
      };
    }

    const boundUserId = await readBoundUserId(page);
    if (boundUserId === "navigation") {
      await page.waitForLoadState("domcontentloaded").catch(() => undefined);
      continue;
    }
    if (!boundUserId) {
      return {
        ok: true,
        via: "bound_user_cleared",
        finalUrl: page.url(),
        logoutApiStatus,
        boundUserId: null,
      };
    }

    if (logoutApiRes?.ok()) {
      const authed = await isAuthenticatedSession(page, origin);
      if (!authed) {
        return {
          ok: true,
          via: "api_logout",
          finalUrl: page.url(),
          logoutApiStatus,
          boundUserId,
        };
      }
    }

    await page.waitForTimeout(150);
  }

  const authed = await isAuthenticatedSession(page, origin);
  if (!authed) {
    const bound = await readBoundUserId(page);
    return {
      ok: true,
      via: "session_null",
      finalUrl: page.url(),
      logoutApiStatus,
      boundUserId: bound === "navigation" ? null : bound,
    };
  }

  const boundFinal = await readBoundUserId(page);
  return {
    ok: false,
    via: "timeout",
    finalUrl: page.url(),
    logoutApiStatus,
    boundUserId: boundFinal === "navigation" ? null : boundFinal,
  };
}

export async function assertLogoutViaUiSucceeded(page: Page, opts?: { path?: LogoutViaUiPath }): Promise<void> {
  const result = await performLogoutViaUi(page, opts);
  expect(result.ok, `logout failed via=${result.via} url=${result.finalUrl} bound=${result.boundUserId}`).toBe(true);
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  const bound = await readBoundUserId(page);
  if (bound !== "navigation") {
    expect(bound).toBeNull();
  }
}

/** Playwright 실패 시 trace/video 보조용 덤프 */
export async function dumpAuthBrowserState(page: Page): Promise<Record<string, unknown>> {
  try {
    return await page.evaluate(async () => {
      const ls: Record<string, string | null> = {};
      try {
        for (let i = 0; i < localStorage.length; i += 1) {
          const key = localStorage.key(i);
          if (key) ls[key] = localStorage.getItem(key);
        }
      } catch {
        /* SecurityError on opaque origin */
      }
      const ss: Record<string, string | null> = {};
      try {
        for (let i = 0; i < sessionStorage.length; i += 1) {
          const key = sessionStorage.key(i);
          if (key) ss[key] = sessionStorage.getItem(key);
        }
      } catch {
        /* ignore */
      }
      let settingsStatus: number | null = null;
      try {
        const res = await fetch("/api/me/settings", { credentials: "include" });
        settingsStatus = res.status;
      } catch {
        settingsStatus = null;
      }
      return {
        href: window.location.href,
        localStorage: ls,
        sessionStorage: ss,
        settingsStatus,
      };
    });
  } catch (error) {
    return {
      href: page.url(),
      dumpError: error instanceof Error ? error.message : String(error),
    };
  }
}
