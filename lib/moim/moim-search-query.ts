/**
 * 모임 검색어 정리 하나 (동네 모임 검색 · 모임 안 검색 공용 — R5 E17 · INTEGRATED §0-11).
 * NFKC 로 모양을 맞추고 글자·숫자·공백만 남긴다 → PostgREST `or()` 예약 문자(쉼표·점·콜론·괄호·따옴표·역슬래시·별표)와
 * ilike 와일드카드(%·_)가 모두 빠진다. 공백은 하나로 모은다. 이모지·기호로는 검색할 수 없다(남은 위험 E17).
 */
function cleanMoimSearchText(raw: string | null | undefined): string {
  return String(raw ?? "")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 동네 모임 검색어 (`listLocalMoims`) — 정리한 뒤 앞 40자(코드 포인트). 빈 문자열이면 검색하지 않는다 */
export function moimSearchTerm(raw: string | null | undefined): string {
  return Array.from(cleanMoimSearchText(raw)).slice(0, 40).join("").trim();
}

/**
 * 모임 안 검색어 (시안 U4 ⌕ · 감사 F11) — 화면·서버 공용.
 * 결과가 2~40자(코드 포인트)면 그 문자열, 아니면 null — 화면은 null 이면 검색하지 않고 안내만 보인다(재감사 L4).
 */
export function normalizeMoimSearchQuery(raw: string | null | undefined): string | null {
  const q = cleanMoimSearchText(raw);
  const n = Array.from(q).length;
  return n >= 2 && n <= 40 ? q : null;
}
