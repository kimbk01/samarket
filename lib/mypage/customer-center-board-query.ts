/**
 * 고객센터 게시판 목록·댓글 API 공용 규칙 (최종 설계 Part D §1.3 S61 · §1.4 S62 · API 표 A12·A13).
 *
 * - 첫 페이지 20건(게시판) / 30건(댓글), 최대 50.
 * - 커서 = `"<created_at>|<id>"` (내정보 커서 SSOT `mypage-list-cursor`). 게시판 정렬은 기존 `created_at desc`
 *   (관리자 작성 시 `published_at = created_at`, 마이그레이션 백필 `COALESCE(published_at, created_at)` — 같은 순서).
 * - 검색 `q` = 제목 ILIKE — `%`·`_`·`\` 이스케이프, 100자 상한.
 * - 실패를 빈 성공으로 응답하지 않는다: 서비스 없음·테이블 없음 503, 그 외 DB 오류 500.
 *
 * 서버·클라이언트 공용(서버 전용 import 없음).
 */
import { MYPAGE_LIST_PAGE_MAX, parseMypageListCursor, type MypageListCursor } from "@/lib/mypage/mypage-list-cursor";

export const CC_BOARD_PAGE_DEFAULT = 20;
export const CC_COMMENTS_PAGE_DEFAULT = 30;
export const CC_BOARD_QUERY_MAX_LEN = 100;

export function parseCcPageLimit(raw: string | null | undefined, fallback: number): number {
  if (raw == null || String(raw).trim() === "") return fallback;
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(MYPAGE_LIST_PAGE_MAX, Math.max(1, n));
}

/** 제목 검색어 정리 — 공백만이면 null */
export function normalizeCcBoardQuery(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim().slice(0, CC_BOARD_QUERY_MAX_LEN);
  return s ? s : null;
}

/** ILIKE 패턴 — 사용자 입력의 와일드카드는 문자 그대로 */
export function ccBoardIlikePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export type CcCursorParse =
  | { ok: true; cursor: MypageListCursor | null; legacyTs: string | null }
  | { ok: false };

/**
 * `cursor` 해석 — `ts|id` keyset. 댓글은 이전 형식(타임스탬프만)도 받는다(`legacyTs`).
 * 원문이 있는데 둘 다 아니면 `{ ok:false }` → 400.
 */
export function parseCcCursor(raw: string | null | undefined, opts?: { allowLegacyTs?: boolean }): CcCursorParse {
  const s = String(raw ?? "").trim();
  if (!s) return { ok: true, cursor: null, legacyTs: null };
  const parsed = parseMypageListCursor(s);
  if (parsed) return { ok: true, cursor: parsed, legacyTs: null };
  if (opts?.allowLegacyTs && !s.includes("|") && Number.isFinite(Date.parse(s)) && /^[0-9T:.+\- Z]{8,40}$/.test(s)) {
    return { ok: true, cursor: null, legacyTs: s };
  }
  return { ok: false };
}

/** PostgREST 오류가 「테이블 없음」인가 (컬럼 없음은 제외) */
export function isCcMissingTableError(
  error: { code?: string | null; message?: string | null } | null | undefined,
  table: string
): boolean {
  if (!error) return false;
  const code = String(error.code ?? "");
  const m = String(error.message ?? "").toLowerCase();
  if (/\bcolumn\b/.test(m)) return false;
  if (code === "42P01" || code === "PGRST205") return true;
  const t = table.toLowerCase();
  return (
    m.includes(`relation "public.${t}" does not exist`) ||
    m.includes(`relation "${t}" does not exist`) ||
    new RegExp(`could not find the table ['"][^'"]*${t}['"]`).test(m)
  );
}
