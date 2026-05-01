import { clearTradeWriteRestoreAfterAddressFlag } from "@/lib/posts/trade-write-address-return-flag";
import { clearTradeWriteFormSessionDraft } from "@/lib/posts/trade-write-form-session-draft";

/** `discardTradeWriteStashedDraft` 직후 — 폼이 언마운트 전까지 재저장하지 않도록 TradeWriteForm 이 구독 */
export const TRADE_WRITE_DRAFT_DISCARDED_EVENT = "samarket:trade-write-draft-discarded";

export type TradeWriteDraftDiscardedDetail = { categoryId: string };

/** 카테고리 변경 등 초안을 버려야 할 때만 호출 — 단순 나가기에서는 호출하지 않음(카테고리별 초안 유지). */
export function discardTradeWriteStashedDraft(categoryId: string): void {
  const id = categoryId.trim();
  clearTradeWriteFormSessionDraft(id);
  clearTradeWriteRestoreAfterAddressFlag(id);
  if (typeof window === "undefined" || !id) return;
  window.dispatchEvent(
    new CustomEvent<TradeWriteDraftDiscardedDetail>(TRADE_WRITE_DRAFT_DISCARDED_EVENT, {
      detail: { categoryId: id },
    })
  );
}

/** 거래 글쓰기 이탈 확인 — 나가도 카테고리별 임시 초안은 유지됨 */
export const TRADE_WRITE_EXIT_SHEET_TITLE = "글쓰기를 나갈까요?";
export const TRADE_WRITE_EXIT_SHEET_BODY =
  "임시 저장된 내용은 이 카테고리에 남습니다. 나중에 다시 열면 이어쓸 수 있어요.";

/** 레거시·로그 한 줄용 */
export const TRADE_WRITE_EXIT_CONFIRM_MESSAGE = `${TRADE_WRITE_EXIT_SHEET_TITLE}. ${TRADE_WRITE_EXIT_SHEET_BODY}`;
