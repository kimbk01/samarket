/**
 * 모임 안 검색어 다듬기 (시안 U4 ⌕ · 감사 F11) — 화면·서버 공용.
 * PostgREST 필터 문법을 깨는 글자(쉼표·괄호·따옴표·역슬래시·별표)와 ilike 와일드카드(%·_)를 지우고, 공백을 하나로 모은다.
 * 결과가 2~40자(코드 포인트)면 그 문자열, 아니면 null — 화면은 null 이면 검색하지 않고 안내만 보인다(재감사 L4).
 */
export function normalizeMoimSearchQuery(raw: string | null | undefined): string | null {
  const q = String(raw ?? "").replace(/[%_\\,()*"'`]/g, " ").replace(/\s+/g, " ").trim();
  const n = Array.from(q).length;
  return n >= 2 && n <= 40 ? q : null;
}
