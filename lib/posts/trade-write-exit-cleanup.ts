import { clearTradeWriteRestoreAfterAddressFlag } from "@/lib/posts/trade-write-address-return-flag";
import {
  clearExchangeWriteMeetSpotStaging,
  clearJobsWriteMeetSpotStaging,
} from "@/lib/posts/jobs-exchange-write-meet-spot-staging";
import { clearTradeWriteFormSessionDraft } from "@/lib/posts/trade-write-form-session-draft";
import { clearTradeWriteMeetSpotStaging } from "@/lib/posts/trade-write-meet-spot-staging";

/** `discardTradeWriteStashedDraft` 직후 — 폼이 언마운트 전까지 재저장하지 않도록 `TradeWriteForm` 등이 구독 */
export const TRADE_WRITE_DRAFT_DISCARDED_EVENT = "samarket:trade-write-draft-discarded";

export type TradeWriteDraftDiscardedDetail = { categoryId: string };

/**
 * 카테고리 변경 등 초안을 버려야 할 때만 호출 — 단순 나가기에서는 호출하지 않음(카테고리별 초안 유지).
 * 신규 거래 작성 폼에 세션 저장소를 추가하면 여기서 같은 `categoryId` 키로 함께 비울 것.
 */
export function discardTradeWriteStashedDraft(categoryId: string): void {
  const id = categoryId.trim();
  clearTradeWriteFormSessionDraft(id);
  clearTradeWriteMeetSpotStaging(id);
  clearJobsWriteMeetSpotStaging(id);
  clearExchangeWriteMeetSpotStaging(id);
  clearTradeWriteRestoreAfterAddressFlag(id);
  if (typeof window === "undefined" || !id) return;
  window.dispatchEvent(
    new CustomEvent<TradeWriteDraftDiscardedDetail>(TRADE_WRITE_DRAFT_DISCARDED_EVENT, {
      detail: { categoryId: id },
    })
  );
}

/** 거래 글쓰기 이탈 확인 — UI는 `t(TRADE_WRITE_EXIT_SHEET_TITLE_KEY)` 등으로만 표시 */
export const TRADE_WRITE_EXIT_SHEET_TITLE_KEY = "ui_write_exit_title" as const;
export const TRADE_WRITE_EXIT_SHEET_BODY_KEY = "ui_write_exit_body" as const;

/** 로그·관측 한 줄용 (번역 key 식별자) */
export const TRADE_WRITE_EXIT_CONFIRM_MESSAGE = `${TRADE_WRITE_EXIT_SHEET_TITLE_KEY}. ${TRADE_WRITE_EXIT_SHEET_BODY_KEY}`;
