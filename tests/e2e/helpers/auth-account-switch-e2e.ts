import type { Page } from "@playwright/test";
import {
  ensureE2eSecondUserSession,
  ensureE2eUserSession,
  fetchE2eProfileLabel,
  gotoWithRetry,
  playwrightOriginFromEnv,
} from "./playwright-origin-and-session";
import { assertLogoutViaUiSucceeded, dumpAuthBrowserState } from "./auth-logout-e2e";

export type E2eAccountSwitchEnv = {
  usernameA: string;
  passwordA: string;
  usernameB: string;
  passwordB: string;
};

/** A→B E2E skip 사유 — null 이면 실행 가능 */
export function resolveE2eAccountSwitchSkipReason(): string | null {
  if (!process.env.E2E_TEST_USERNAME?.trim()) {
    return "E2E_TEST_USERNAME not set — set account A credentials to run A→B switch QA";
  }
  if (!process.env.E2E_TEST_USERNAME_B?.trim()) {
    return "E2E_TEST_USERNAME_B not set — set account B credentials to run A→B switch QA";
  }
  return null;
}

export function readE2eAccountSwitchEnv(): E2eAccountSwitchEnv | null {
  if (resolveE2eAccountSwitchSkipReason()) return null;
  return {
    usernameA: process.env.E2E_TEST_USERNAME!.trim(),
    passwordA: process.env.E2E_TEST_PASSWORD?.trim() || "1234",
    usernameB: process.env.E2E_TEST_USERNAME_B!.trim(),
    passwordB: process.env.E2E_TEST_PASSWORD_B?.trim() || process.env.E2E_TEST_PASSWORD?.trim() || "1234",
  };
}

export type AccountAPrivateContext = {
  userId: string | null;
  label: string | null;
  privateRoomPath: string;
  profilePath: string;
  messengerHomePath: string;
};

export async function loginAccountA(page: Page): Promise<AccountAPrivateContext> {
  const env = readE2eAccountSwitchEnv();
  if (!env) throw new Error(resolveE2eAccountSwitchSkipReason() ?? "A→B env missing");

  await ensureE2eUserSession(page, { username: env.usernameA, password: env.passwordA });
  const origin = playwrightOriginFromEnv();
  const label = await fetchE2eProfileLabel(page, origin);
  const profileRes = await page.request.get(`${origin}/api/me/profile`).catch(() => null);
  const profileJson = profileRes?.ok()
    ? ((await profileRes.json().catch(() => null)) as { profile?: { id?: string } } | null)
    : null;
  const userId = profileJson?.profile?.id ?? null;

  const roomSuffix = userId ?? "unknown";
  return {
    userId,
    label,
    privateRoomPath: `/community-messenger/rooms/e2e-a-account-${roomSuffix}`,
    profilePath: userId ? `/mypage/profile?probe=${encodeURIComponent(userId)}` : "/mypage/profile",
    messengerHomePath: "/community-messenger",
  };
}

export async function logoutAccountA(page: Page): Promise<void> {
  await assertLogoutViaUiSucceeded(page, { path: "/mypage/logout" });
}

export async function loginAccountB(page: Page): Promise<void> {
  const env = readE2eAccountSwitchEnv();
  if (!env) throw new Error(resolveE2eAccountSwitchSkipReason() ?? "A→B env missing");

  const origin = playwrightOriginFromEnv();
  await gotoWithRetry(page, `${origin}/login`);

  await page.context().clearCookies();
  await page.evaluate(() => {
    try {
      window.localStorage.clear();
      window.sessionStorage.clear();
    } catch {
      /* cross-origin or denied — cookie wipe + re-login suffices */
    }
  });

  await ensureE2eSecondUserSession(page, {
    username: env.usernameB,
    password: env.passwordB,
  });
}

export async function assertNoAccountALeakOnPage(
  page: Page,
  accountALabel: string | null,
  accountBLabel: string | null
): Promise<void> {
  const bodyText = await page.locator("body").innerText().catch(() => "");
  if (accountALabel && accountALabel !== accountBLabel && bodyText.includes(accountALabel)) {
    const dump = await dumpAuthBrowserState(page);
    throw new Error(
      `[A→B FAIL] Account A label "${accountALabel}" visible after B login url=${page.url()} dump=${JSON.stringify(dump).slice(0, 500)}`
    );
  }
}

export async function visitAccountAPrivateUrlsAsB(
  page: Page,
  ctx: AccountAPrivateContext,
  accountBLabel: string | null
): Promise<void> {
  const origin = playwrightOriginFromEnv();
  const targets = [ctx.privateRoomPath, ctx.profilePath, ctx.messengerHomePath];

  for (const target of targets) {
    await gotoWithRetry(page, `${origin}${target}`).catch(() => undefined);
    await page.waitForLoadState("domcontentloaded").catch(() => undefined);
    await page.waitForTimeout(800);
    await assertNoAccountALeakOnPage(page, ctx.label, accountBLabel);
    const pathname = new URL(page.url()).pathname;
    const allowed =
      /\/login(\/|$)/.test(pathname) ||
      pathname.startsWith("/community-messenger") ||
      pathname.startsWith("/mypage") ||
      pathname === "/";
    if (!allowed && ctx.label) {
      await assertNoAccountALeakOnPage(page, ctx.label, accountBLabel);
    }
  }
}

export async function seedAccountAVisibleState(page: Page, ctx: AccountAPrivateContext): Promise<void> {
  const origin = playwrightOriginFromEnv();
  await gotoWithRetry(page, `${origin}${ctx.messengerHomePath}`);
  await page.evaluate(
    ({ roomPath, label }) => {
      window.localStorage.setItem("samarket:fake_a_nickname", label ?? "account-a-marker");
      window.localStorage.setItem("samarket:fake_a_room", roomPath);
    },
    { roomPath: ctx.privateRoomPath, label: ctx.label }
  );
}
