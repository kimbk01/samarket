import { registerPlugin } from "@capacitor/core";
import type { AppLanguageCode } from "@/lib/i18n/config";
import { resolveCapacitorShellPlatform } from "@/lib/platform/capacitor-native";

/**
 * 언어 SSOT S8-1 — 앱 언어를 네이티브(iOS UserDefaults · Android SharedPreferences)에 저장한다.
 * 값: "ko" · "en" = 고른(또는 계정의) 화면 언어, null = 기기 언어를 따름(`displayLanguageCookieValue` 와 같은 규칙).
 * 웹·플러그인이 없는 구 앱: 조용히 아무것도 하지 않는다(절대 throw 하지 않음).
 * 계획: `docs/audit/i18n-s8-native-plan-2026-11-08.md` S8-1.
 */
export const DIBAY_APP_LANGUAGE_PLUGIN_ID = "DibayAppLanguage";

type DibayAppLanguagePlugin = {
  set(options: { language: AppLanguageCode | null }): Promise<unknown>;
};

const DibayAppLanguage = registerPlugin<DibayAppLanguagePlugin>(DIBAY_APP_LANGUAGE_PLUGIN_ID);

type WindowWithCapacitorHeaders = Window & {
  Capacitor?: { PluginHeaders?: Array<{ name?: string }> };
};

/** false — 네이티브가 알려 준 플러그인 목록에 이 플러그인이 없음(구 앱) */
function nativePluginMayExist(): boolean {
  if (typeof window === "undefined") return false;
  const headers = (window as WindowWithCapacitorHeaders).Capacitor?.PluginHeaders;
  if (!Array.isArray(headers)) return true;
  return headers.some((header) => header?.name === DIBAY_APP_LANGUAGE_PLUGIN_ID);
}

/** 저장에 성공하면 true. 웹·구 앱·오류는 false. */
export async function setNativeAppLanguage(language: AppLanguageCode | null): Promise<boolean> {
  const shell = resolveCapacitorShellPlatform();
  if (shell !== "android" && shell !== "ios") return false;
  if (!nativePluginMayExist()) return false;
  try {
    await DibayAppLanguage.set({ language });
    return true;
  } catch {
    return false;
  }
}
