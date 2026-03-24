/**
 * slug 검증: 영문 소문자, 숫자, 하이픈(-)만 허용
 */

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function validateSlugFormat(slug: string): { ok: true } | { ok: false; error: string } {
  const s = slug?.trim();
  if (!s) return { ok: false, error: "slug를 입력해 주세요." };
  if (s.length > 100) return { ok: false, error: "slug는 100자 이하여야 합니다." };
  if (!SLUG_REGEX.test(s)) {
    return {
      ok: false,
      error: "영문 소문자, 숫자, 하이픈(-)만 사용할 수 있습니다. 예: jobs, real-estate",
    };
  }
  return { ok: true };
}
