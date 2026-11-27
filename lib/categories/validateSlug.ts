/**
 * slug 검증: 영문 소문자, 숫자, 하이픈(-)만 허용
 * 실패는 코드만 돌려준다 — 화면은 `categorySlugErrorKey` 로 문구 키를 고른다 (언어 재감사 2026-11-27).
 */
import type { MessageKey } from "@/lib/i18n/messages";

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** slug 검사 코드 → 문구 키 (`validateSlugFormat`·`checkSlugAvailable` 공통) */
export const CATEGORY_SLUG_ERROR_KEYS: Readonly<Record<string, MessageKey>> = {
  slug_required: "category_slug_err_required",
  slug_too_long: "category_slug_err_too_long",
  slug_invalid_format: "category_slug_err_format",
  slug_taken: "category_slug_err_taken",
  slug_check_failed: "category_slug_err_check_failed",
};

export function categorySlugErrorKey(code: string | null | undefined): MessageKey {
  const c = typeof code === "string" ? code.trim() : "";
  return CATEGORY_SLUG_ERROR_KEYS[c] ?? "category_slug_err_check_failed";
}

export function validateSlugFormat(slug: string): { ok: true } | { ok: false; error: string } {
  const s = slug?.trim();
  if (!s) return { ok: false, error: "slug_required" };
  if (s.length > 100) return { ok: false, error: "slug_too_long" };
  if (!SLUG_REGEX.test(s)) {
    return {
      ok: false,
      error: "slug_invalid_format",
    };
  }
  return { ok: true };
}
