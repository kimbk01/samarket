import type { Page } from "@playwright/test";
import { APP_LANGUAGE_COOKIE, APP_LANGUAGE_STORAGE_KEY } from "@/lib/i18n/config";

/** 브라우저 탭 진입 전에 호출 — AppLanguageProvider 와 동일 저장소 키 */
export async function setAppLanguageOnPage(page: Page, language: "ko" | "en"): Promise<void> {
  await page.addInitScript(
    ({ storageKey, cookieName, lang }) => {
      window.localStorage.setItem(storageKey, lang);
      document.cookie = `${cookieName}=${encodeURIComponent(lang)}; path=/; max-age=31536000; SameSite=Lax`;
    },
    {
      storageKey: APP_LANGUAGE_STORAGE_KEY,
      cookieName: APP_LANGUAGE_COOKIE,
      lang: language,
    }
  );
}
