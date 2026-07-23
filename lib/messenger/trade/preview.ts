/**
 * trade PreviewPort — 최신 메시지만. 상품 summary/상태로 preview 대체 금지.
 */
import type { DomainPreview } from "@/lib/messenger/contracts/ports";

export type TradePreviewMessage = Readonly<{
  content: string | null | undefined;
  messageType: string | null | undefined;
  isSystemAllowed?: boolean;
}>;

const FORBIDDEN = ["📋 주문 요약", "상품 요약", "주문 요약"] as const;

/** 메시지 없음 · body 빈 문자열 — summary/status로 대체하지 않음 */
export const TRADE_EMPTY_CONVERSATION_PREVIEW = "메시지가 없습니다" as const;

export function resolveTradePreview(message: TradePreviewMessage | null | undefined): DomainPreview {
  if (!message) return { text: TRADE_EMPTY_CONVERSATION_PREVIEW, source: "empty" };
  const type = (message.messageType ?? "text").trim();
  const content = (message.content ?? "").trim();
  for (const m of FORBIDDEN) {
    if (content.includes(m)) throw new Error("dibay_trade_preview_summary_forbidden");
  }
  if (type === "image") return { text: "사진", source: "latest_user_message" };
  if (type === "voice") return { text: "음성 메시지", source: "latest_user_message" };
  if (type === "file") return { text: content || "파일", source: "latest_user_message" };
  if (type === "system") {
    if (message.isSystemAllowed === false) {
      return { text: TRADE_EMPTY_CONVERSATION_PREVIEW, source: "empty" };
    }
    return {
      text: content || TRADE_EMPTY_CONVERSATION_PREVIEW,
      source: content ? "allowed_system_message" : "empty",
    };
  }
  if (!content) return { text: TRADE_EMPTY_CONVERSATION_PREVIEW, source: "empty" };
  return { text: content, source: "latest_user_message" };
}

export function assertTradePreviewDoesNotUseMetadata(input: {
  headline?: string | null;
  productSummary?: string | null;
  statusAsPreview?: string | null;
  roomTitleAsPreview?: string | null;
}): void {
  if (
    input.headline?.trim() ||
    input.productSummary?.trim() ||
    input.statusAsPreview?.trim() ||
    input.roomTitleAsPreview?.trim()
  ) {
    throw new Error("dibay_trade_preview_metadata_forbidden");
  }
}
