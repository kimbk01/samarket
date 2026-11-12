/**
 * R1 (docs/audit/cold-start-and-remaining-defects-final-design-2026-11-12.md §4 · Owner 「R1 진행」 2026-11-12):
 * 홈 배너는 회원 확인이 끝날 때까지 대상(회원/비로그인)을 몰라 숨겨졌다(샤오미 운영 앱 실측 0.43~0.61초).
 * 확인 중에는 기기에 남은 로그인 쿠키(`sb-<ref>-auth-token`, 청크 `.0 .1 …`) 유무로 대상을 먼저 정하고,
 * 확인 결과가 다르면 그 대상의 배너로 바꾼다. 쿠키 값은 읽지 않는다(있는지만 본다).
 */
const AUTH_TOKEN_COOKIE_RE = /^sb-[^.=]+-auth-token(?:\.\d+)?$/;

export function hasSupabaseAuthTokenCookie(cookieHeader: string): boolean {
  for (const seg of cookieHeader.split(";")) {
    const eq = seg.indexOf("=");
    if (eq <= 0) continue;
    if (!AUTH_TOKEN_COOKIE_RE.test(seg.slice(0, eq).trim())) continue;
    if (seg.slice(eq + 1).trim().length > 0) return true;
  }
  return false;
}
