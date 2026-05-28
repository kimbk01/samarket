/**
 * Philife 글쓰기 — 거래 `trade-write-fb-ui` 와 동일한 연속 섹션·구분선(당근/FB형).
 */
export {
  TRADE_WRITE_FB_SECTION as PHILIFE_WRITE_FB_SECTION,
  TRADE_WRITE_FB_BLOCK_TITLE as PHILIFE_WRITE_FB_BLOCK_TITLE,
  TRADE_WRITE_FB_FIELD_LABEL as PHILIFE_WRITE_FB_FIELD_LABEL,
  TRADE_WRITE_FB_CONTROL as PHILIFE_WRITE_FB_CONTROL,
} from "@/lib/ui/trade-write-fb-ui";

/** 글쓰기 폼 루트 — 섹션 자체에 구분선·패딩 */
export const PHILIFE_WRITE_FORM_ROOT_CLASS = "min-w-0 w-full max-w-full space-y-0 py-0";

/** 스크롤 본문 — 고정 하단 취소·등록 바 높이만큼 여백 */
export const PHILIFE_WRITE_SCROLL_BODY_CLASS =
  "min-h-0 flex-1 overflow-y-auto overscroll-y-contain pb-[calc(4.75rem+env(safe-area-inset-bottom,0px))]";
