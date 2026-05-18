/**
 * DIBAY i18n 정책 E2E.
 *
 * 로그인 필요 시나리오 전제:
 * - `E2E_TEST_USERNAME` / `E2E_TEST_PASSWORD` (Supabase 비밀번호 로그인 가능 계정), 또는
 * - `node tests/e2e/scripts/create-cm-storage-state.mjs` → `tests/e2e/.auth/cm-storage.json`
 *
 * 실행: `npm run dev` 후 `npx playwright test tests/e2e/i18n-my-profile-language.spec.ts`
 */
import { expect, test } from "@playwright/test";
import {
  PHASE3_MY_ACCOUNT_PATH,
  PHASE3_MY_E2E_ASSERT_KEYS,
  PHASE3_MY_HANGUL_UI,
  PHASE3_MY_PROFILE_EDIT_PATH,
  phase3MyExpectedText,
} from "@/lib/i18n/phase3-my-e2e-contract";
import {
  assertLoginPageLanguage,
  clearAppLanguagePersistenceOnPage,
  gotoLanguageSettings,
  installBrowserLanguageOnly,
  patchPreferredLanguageNull,
  readAppLanguageCookie,
  selectAppLanguageInSettings,
  installAcceptLanguageForPage,
  visitDomainsAndAssertLanguage,
} from "./helpers/i18n-language-e2e";
import {
  assertPlaywrightOriginReachable,
  ensureE2eUserSession,
  gotoWithRetry,
  playwrightOriginFromEnv,
} from "./helpers/playwright-origin-and-session";
import { setAppLanguageOnPage } from "./helpers/i18n-set-app-language";
import { I18N_E2E_LOGOUT_PATH } from "@/lib/i18n/i18n-e2e-contract";

async function skipWhenE2eLoginUnavailable(page: import("@playwright/test").Page, request: import("@playwright/test").APIRequestContext) {
  await assertPlaywrightOriginReachable(request);
  try {
    await ensureE2eUserSession(page);
  } catch (e) {
    test.skip(true, String(e instanceof Error ? e.message : e));
  }
}

test.describe("i18n phase3 — my profile & account (ko/en)", () => {
  test.beforeEach(async ({ page, request }) => {
    await skipWhenE2eLoginUnavailable(page, request);
  });

  test("English: profile edit and account show catalog strings, no hangul chrome", async ({ page }) => {
    await setAppLanguageOnPage(page, "en");

    await page.goto(PHASE3_MY_PROFILE_EDIT_PATH, { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: phase3MyExpectedText("en", PHASE3_MY_E2E_ASSERT_KEYS.profileEditTitle) })
    ).toBeVisible({ timeout: 30_000 });

    await expect(page.getByText(phase3MyExpectedText("en", PHASE3_MY_E2E_ASSERT_KEYS.profileEditSectionBasic))).toBeVisible();
    await expect(
      page.getByText(phase3MyExpectedText("en", PHASE3_MY_E2E_ASSERT_KEYS.profileEditNicknameLabel))
    ).toBeVisible();

    const editMain = page.locator("main").first();
    const editText = (await editMain.innerText().catch(() => "")) || (await page.locator("body").innerText());
    expect(PHASE3_MY_HANGUL_UI.test(editText), "profile edit should not show Korean UI chrome in en").toBe(false);

    await page.goto(PHASE3_MY_ACCOUNT_PATH, { waitUntil: "domcontentloaded" });
    await expect(
      page.getByText(phase3MyExpectedText("en", PHASE3_MY_E2E_ASSERT_KEYS.accountInfoTitle), { exact: false })
    ).toBeVisible({ timeout: 30_000 });

    const accountText = (await page.locator("main").first().innerText().catch(() => "")) || (await page.locator("body").innerText());
    expect(PHASE3_MY_HANGUL_UI.test(accountText), "account page should not show Korean UI chrome in en").toBe(false);
  });

  test("Korean: profile edit title uses Korean catalog", async ({ page }) => {
    await setAppLanguageOnPage(page, "ko");

    await page.goto(PHASE3_MY_PROFILE_EDIT_PATH, { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: phase3MyExpectedText("ko", PHASE3_MY_E2E_ASSERT_KEYS.profileEditTitle) })
    ).toBeVisible({ timeout: 30_000 });
  });
});

test.describe("i18n DIBAY — language policy smoke", () => {
  const origin = playwrightOriginFromEnv();

  test.describe("guest — browser language only (login page)", () => {
    test("browser ko → Korean login chrome", async ({ browser }) => {
      const context = await browser.newContext({
        storageState: { cookies: [], origins: [] },
        locale: "ko-KR",
        extraHTTPHeaders: { "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.5,en;q=0.3" },
      });
      const page = await context.newPage();
      await installBrowserLanguageOnly(page, "ko");
      await gotoWithRetry(page, `${origin}/login`);
      await assertLoginPageLanguage(page, "ko");
      await context.close();
    });

    test("browser en → English login chrome", async ({ browser }) => {
      const context = await browser.newContext({
        storageState: { cookies: [], origins: [] },
        locale: "en-US",
        extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9,ko-KR;q=0.5,ko;q=0.3" },
      });
      const page = await context.newPage();
      await installBrowserLanguageOnly(page, "en");
      await gotoWithRetry(page, `${origin}/login`);
      await assertLoginPageLanguage(page, "en");
      await context.close();
    });
  });

  test.describe("logged-in — settings source of truth", () => {
    test.beforeEach(async ({ page, request }) => {
      await skipWhenE2eLoginUnavailable(page, request);
    });

    test("preferred_language null → browser language (en)", async ({ page }) => {
      await patchPreferredLanguageNull(page, origin);
      await clearAppLanguagePersistenceOnPage(page);
      await installAcceptLanguageForPage(page, "en");
      await installBrowserLanguageOnly(page, "en");
      await gotoWithRetry(page, `${origin}/market`);
      await visitDomainsAndAssertLanguage(page, "en", origin);
    });

    test("myinfo English → immediate, refresh, all domains", async ({ page }) => {
      await gotoLanguageSettings(page, origin);
      await selectAppLanguageInSettings(page, "en");

      await visitDomainsAndAssertLanguage(page, "en", origin);

      await gotoWithRetry(page, `${origin}/market`);
      await page.reload({ waitUntil: "domcontentloaded" });
      await visitDomainsAndAssertLanguage(page, "en", origin);
    });

    test("myinfo Korean → immediate, refresh, all domains", async ({ page }) => {
      await gotoLanguageSettings(page, origin);
      await selectAppLanguageInSettings(page, "ko");

      await visitDomainsAndAssertLanguage(page, "ko", origin);

      await gotoWithRetry(page, `${origin}/market`);
      await page.reload({ waitUntil: "domcontentloaded" });
      await visitDomainsAndAssertLanguage(page, "ko", origin);
    });

    test("logout clears explicit cookie and returns to browser ko", async ({ page, request }) => {
      await gotoLanguageSettings(page, origin);
      await selectAppLanguageInSettings(page, "en");
      await expect.poll(async () => readAppLanguageCookie(page)).toBe("en");

      await gotoWithRetry(page, `${origin}${I18N_E2E_LOGOUT_PATH}`);
      await page.getByRole("button", { name: "로그아웃", exact: true }).click();
      await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });
      await expect.poll(async () => readAppLanguageCookie(page), { timeout: 15_000 }).toBeNull();

      const guest = await page.context().newPage();
      await installAcceptLanguageForPage(guest, "ko");
      await installBrowserLanguageOnly(guest, "ko");
      await gotoWithRetry(guest, `${origin}/login`);
      await assertLoginPageLanguage(guest, "ko");
      await guest.close();
    });
  });
});
