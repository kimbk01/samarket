/**
 * Philife 글쓰기 — 거래 `trade-write-fb-ui` 와 동일한 연속 섹션·구분선(당근/FB형).
 */
export {
  TRADE_WRITE_FB_SECTION as PHILIFE_WRITE_FB_SECTION,
  TRADE_WRITE_FB_BLOCK_TITLE as PHILIFE_WRITE_FB_BLOCK_TITLE,
  TRADE_WRITE_FB_FIELD_LABEL as PHILIFE_WRITE_FB_FIELD_LABEL,
  TRADE_WRITE_FB_CONTROL as PHILIFE_WRITE_FB_CONTROL,
} from "@/lib/ui/trade-write-fb-ui";

/** 주제 `<select>` — `sam-select` 타이포·chevron (FB control 과 분리) */
export const PHILIFE_WRITE_SELECT_CLASS =
  "sam-select bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%2024%2024%22%20stroke%3D%22%23667085%22%3E%3Cpath%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20stroke-width%3D%222%22%20d%3D%22M19%209l-7%207-7-7%22%2F%3E%3C%2Fsvg%3E')] [background-position:right_0.75rem_center] [background-size:1rem] bg-no-repeat";

/** 글쓰기 폼 루트 — 섹션 자체에 구분선·패딩 */
export const PHILIFE_WRITE_FORM_ROOT_CLASS = "min-w-0 w-full max-w-full space-y-0 py-0";

/** 스크롤 본문 — 고정 하단 취소·등록 바 높이만큼 여백 */
export const PHILIFE_WRITE_SCROLL_BODY_CLASS =
  "min-h-0 flex-1 overflow-y-auto overscroll-y-contain pb-[calc(4.75rem+var(--safe-bottom))]";
