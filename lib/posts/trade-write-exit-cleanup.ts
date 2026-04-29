import { clearTradeWriteRestoreAfterAddressFlag } from "@/lib/posts/trade-write-address-return-flag";
import { clearTradeWriteFormSessionDraft } from "@/lib/posts/trade-write-form-session-draft";

/** `discardTradeWriteStashedDraft` 직후 — 폼이 언마운트 전까지 재저장하지 않도록 TradeWriteForm 이 구독 */
export const TRADE_WRITE_DRAFT_DISCARDED_EVENT = "samarket:trade-write-draft-discarded";

export type TradeWriteDraftDiscardedDetail = { categoryId: string };

/** 시트·취소 확인(나가기) 시 임시 초안·복귀 플래그 제거 */
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

/** 거래 글쓰기 이탈 확인 — 임시저장 복구 팝업과 동일 타이틀 톤 */
export const TRADE_WRITE_EXIT_SHEET_TITLE = "작성 중이던 글이 있습니다";
export const TRADE_WRITE_EXIT_SHEET_BODY =
  "나가면 임시 저장된 내용이 삭제됩니다. 나가시겠어요?";

/** 레거시·로그 한 줄용 */
export const TRADE_WRITE_EXIT_CONFIRM_MESSAGE = `${TRADE_WRITE_EXIT_SHEET_TITLE}. ${TRADE_WRITE_EXIT_SHEET_BODY}`;
