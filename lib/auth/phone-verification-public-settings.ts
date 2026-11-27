import type { AuthPhoneSettings } from "@/lib/auth/auth-phone-settings";
import type { AppLanguageCode } from "@/lib/i18n/config";

/**
 * `GET /api/me/phone-verification` 의 `verification.settings` — 회원에게 내보내는 값 **허용 목록** (등록 후속 감사 B13).
 * 관리자 정보(`updated_by`·`change_reason`·`id`·`row_version`·시각·공급자 상세)는 내보내지 않는다.
 * 화면 파서(`lib/mypage/load-phone-verification-state.ts` `parsePhoneVerificationSettings`)가 읽는 키와 같다.
 */
export const PUBLIC_PHONE_VERIFICATION_SETTINGS_KEYS = [
  "enabled",
  "provider",
  "guide_text",
  "resend_cooldown_seconds",
  "country_dial_codes",
  "default_dial_code",
] as const;

export type PublicPhoneVerificationSettings = {
  enabled: boolean;
  provider: AuthPhoneSettings["provider"];
  guide_text: string;
  resend_cooldown_seconds: number;
  country_dial_codes: string[];
  default_dial_code: string;
};

const HANGUL_RE = /[ᄀ-ᇿ㄰-㆏가-힯]/;

/**
 * 안내 문구 — 관리자가 한 언어로만 저장하므로, 글자가 화면 언어와 다르면 비워 화면이 `t("my_phone_tg_desc")` 로 대체한다.
 * - 영어 요청 + 한국어 문구 → 비움 (B8)
 * - 한국어 요청 + 한글 없는 문구(영어로 저장) → 비움 (재감사 2026-11-27 A4)
 */
export function resolvePublicPhoneGuideText(guideText: string | null | undefined, language: AppLanguageCode): string {
  const text = String(guideText ?? "").trim();
  const hasHangul = HANGUL_RE.test(text);
  if (language === "en" && hasHangul) return "";
  if (language === "ko" && !hasHangul) return "";
  return text;
}

export function buildPublicPhoneVerificationSettings(
  settings: Pick<AuthPhoneSettings, "enabled" | "provider" | "guide_text" | "resend_cooldown_seconds">,
  input: { dialCodes: string[]; defaultDialCode: string; language: AppLanguageCode },
): PublicPhoneVerificationSettings {
  return {
    enabled: settings.enabled === true,
    provider: settings.provider,
    guide_text: resolvePublicPhoneGuideText(settings.guide_text, input.language),
    resend_cooldown_seconds: settings.resend_cooldown_seconds,
    country_dial_codes: input.dialCodes,
    default_dial_code: input.defaultDialCode,
  };
}
