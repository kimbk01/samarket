import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { APP_LANGUAGE_COOKIE, APP_LANGUAGE_STORAGE_KEY } from "@/lib/i18n/config";
import {
  I18N_E2E_DOMAIN_PROBES,
  I18N_E2E_HANGUL_UI,
  I18N_E2E_LANGUAGE_SETTINGS_PATH,
  I18N_E2E_LOGIN_PROBE_KEY,
  I18N_E2E_NAV_KEYS,
  i18nE2eExpectedText,
  type I18nE2eDomainProbe,
} from "@/lib/i18n/i18n-e2e-contract";
import { gotoWithRetry, playwrightOriginFromEnv } from "./playwright-origin-and-session";

export type E2eAppLanguage = "ko" | "en";

/** `assertPlaywrightOriginAndTestLogin` 이 심은 kasama_dev_uid 를 브라우저 컨텍스트에 복사 */
export async function syncE2eSessionCookiesToPage(
  page: Page,
  request: APIRequestContext
): Promise<void> {
  const state = await request.storageState();
  if (state.cookies.length > 0) {
    await page.context().addCookies(state.cookies);
  }
}

/** SSR `accept-language` + 클라이언트 `navigator` 정합 (비로그인 browser language E2E) */
export async function installAcceptLanguageForPage(page: Page, language: E2eAppLanguage): Promise<void> {
  await page.context().setExtraHTTPHeaders({
    "Accept-Language":
      language === "ko"
        ? "ko-KR,ko;q=0.9,en-US;q=0.5,en;q=0.3"
        : "en-US,en;q=0.9,ko-KR;q=0.5,ko;q=0.3",
  });
}

/** 브라우저 언어만 주입 — cookie/local explicit 앱 언어 저장소는 건드리지 않음 */
export async function installBrowserLanguageOnly(page: Page, language: E2eAppLanguage): Promise<void> {
  const langs = language === "ko" ? ["ko-KR", "ko"] : ["en-US", "en"];
  await page.addInitScript((localeList) => {
    try {
      Object.defineProperty(navigator, "languages", {
        configurable: true,
        get: () => localeList,
      });
      Object.defineProperty(navigator, "language", {
        configurable: true,
        get: () => localeList[0],
      });
    } catch {
      /* ignore */
    }
  }, langs);
}

export async function clearAppLanguagePersistenceOnPage(page: Page): Promise<void> {
  await page.evaluate(
    ({ storageKey, cookieName }) => {
      window.localStorage.removeItem(storageKey);
      document.cookie = `${cookieName}=; path=/; max-age=0; SameSite=Lax`;
    },
    { storageKey: APP_LANGUAGE_STORAGE_KEY, cookieName: APP_LANGUAGE_COOKIE }
  );
}

export async function readAppLanguageCookie(page: Page): Promise<string | null> {
  return page.evaluate((cookieName) => {
    const raw = document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${cookieName}=`));
    if (!raw) return null;
    return decodeURIComponent(raw.slice(cookieName.length + 1));
  }, APP_LANGUAGE_COOKIE);
}

export async function patchPreferredLanguageNull(page: Page, origin: string): Promise<void> {
  const res = await page.request.patch(`${origin}/api/me/settings`, {
    data: { preferred_language: null },
  });
  expect(res.ok(), `PATCH preferred_language=null failed status=${res.status()}`).toBeTruthy();
}

export async function gotoLanguageSettings(page: Page, origin?: string): Promise<void> {
  const base = (origin ?? playwrightOriginFromEnv()).replace(/\/$/, "");
  await gotoWithRetry(page, `${base}${I18N_E2E_LANGUAGE_SETTINGS_PATH}`);
  await expect(
    page.getByRole("button", { name: /^English$|^한국어$|^Korean$/ })
  ).toBeVisible({ timeout: 30_000 });
}

export async function selectAppLanguageInSettings(page: Page, language: E2eAppLanguage): Promise<void> {
  const pattern =
    language === "ko" ? /^(한국어|Korean)$/ : /^English$/;
  const btn = page.getByRole("button", { name: pattern });
  await expect(btn).toBeVisible({ timeout: 15_000 });
  await btn.click();
  await expect
    .poll(async () => readAppLanguageCookie(page), { timeout: 15_000 })
    .toBe(language);
}

export async function expectGlobalBottomNavLanguage(page: Page, language: E2eAppLanguage): Promise<void> {
  const nav = page.getByRole("navigation", {
    name: i18nE2eExpectedText(language, "nav_bottom_bar_aria"),
  });
  await expect(nav).toBeVisible({ timeout: 30_000 });
  for (const key of I18N_E2E_NAV_KEYS) {
    await expect(nav.getByText(i18nE2eExpectedText(language, key), { exact: true })).toBeVisible({
      timeout: 15_000,
    });
  }
}

async function assertDomainProbe(page: Page, probe: I18nE2eDomainProbe, language: E2eAppLanguage): Promise<void> {
  if (probe.kind === "bottomNav") {
    await expectGlobalBottomNavLanguage(page, language);
    return;
  }
  if (probe.kind === "aria") {
    await expect(
      page.getByRole("button", { name: i18nE2eExpectedText(language, probe.labelKey) })
    ).toBeVisible({ timeout: 30_000 });
    return;
  }
  if (probe.kind === "adminSurface") {
    const quicklinks = page.getByRole("heading", {
      name: i18nE2eExpectedText(language, probe.quicklinksKey),
    });
    const denied = page.getByText(i18nE2eExpectedText(language, probe.deniedKey), { exact: false });
    await expect(quicklinks.or(denied)).toBeVisible({ timeout: 45_000 });
    return;
  }
  await expect(
    page.getByRole("heading", { name: i18nE2eExpectedText(language, probe.labelKey) })
  ).toBeVisible({ timeout: 30_000 });
}

export async function visitDomainsAndAssertLanguage(
  page: Page,
  language: E2eAppLanguage,
  origin?: string
): Promise<void> {
  const base = (origin ?? playwrightOriginFromEnv()).replace(/\/$/, "");
  for (const probe of I18N_E2E_DOMAIN_PROBES) {
    await gotoWithRetry(page, `${base}${probe.path}`);
    await assertDomainProbe(page, probe, language);
    if (language === "en") {
      const mainText =
        (await page.locator("main").first().innerText().catch(() => "")) ||
        (await page.locator("body").innerText());
      expect(I18N_E2E_HANGUL_UI.test(mainText), `${probe.id} should not show Korean UI chrome in en`).toBe(
        false
      );
    }
  }
}

export function loginIdentifierTextbox(page: Page, language: E2eAppLanguage) {
  const label = i18nE2eExpectedText(language, I18N_E2E_LOGIN_PROBE_KEY);
  return page.getByRole("textbox", { name: label });
}

export async function assertLoginPageLanguage(page: Page, language: E2eAppLanguage): Promise<void> {
  const textbox = loginIdentifierTextbox(page, language);
  await expect
    .poll(async () => textbox.isVisible(), { timeout: 45_000 })
    .toBe(true);
}
