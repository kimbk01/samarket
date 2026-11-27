/**
 * SNS 가 이름을 주지 않을 때 넣는 임시 닉네임 — 가입 화면 언어로 (재감사 2026-11-27 A1 ·
 * 설계 `docs/audit/i18n-full-reaudit-fix-design-2026-11-27.md` P1).
 * 문구 원본 = 카탈로그 `profile_default_display_name` (ko 「DIBAY 사용자」 · en 「DIBAY user」).
 * 서버 전용(카탈로그 전체를 가져오므로 클라이언트 공통 정책 파일에 두지 않는다).
 */
import type { AppLanguageCode } from "@/lib/i18n/config";
import { translate } from "@/lib/i18n/messages";

function pickTrimmed(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** 시스템 임시 닉네임 값 전부(ko·en) — 회원이 고른 이름이 아니라 교체 대상 */
export function oauthSystemDisplayNames(): readonly string[] {
  return [translate("ko", "profile_default_display_name"), translate("en", "profile_default_display_name")];
}

export function isOAuthSystemDisplayName(value: string | null | undefined): boolean {
  const v = pickTrimmed(value);
  return v != null && oauthSystemDisplayNames().includes(v);
}

export function resolveOAuthSeedDisplayName(
  nicknameCandidate: string | null | undefined,
  language: AppLanguageCode
): string {
  return pickTrimmed(nicknameCandidate) ?? translate(language, "profile_default_display_name");
}
