/**
 * trade PreviewPort — 최신 메시지만. 상품 summary/상태로 preview 대체 금지.
 */
import { resolveRoomLastMessageForViewer } from "@/lib/community-messenger/call-stub-room-tip";
import { formatCmListPreviewTextForViewer } from "@/lib/community-messenger/cm-home-list-copy";
import type { CommunityMessengerMessageType } from "@/lib/community-messenger/types";
import type { DomainPreview } from "@/lib/messenger/contracts/ports";
import type { TradeListItem } from "@/lib/messenger/trade/types";

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

/** 리스트 라벨이 필요한 타입 — 홈 리스트 포맷터(`getRoomPreviewText`)와 동일 문구 */
const TRADE_LIST_LABELED_MESSAGE_TYPES: ReadonlySet<string> = new Set<CommunityMessengerMessageType>([
  "call_stub",
  "sticker",
  "gift_certificate",
  "community_post_share",
]);

/** TradeListItem 은 viewer-relative — viewer id 는 role 로 결정(seller → seller, buyer → counterparty). */
export function tradeListItemViewerUserId(
  item: Pick<TradeListItem, "viewerRole" | "sellerUserId" | "counterpartyUserId">
): string {
  return (item.viewerRole === "seller" ? item.sellerUserId : item.counterpartyUserId).trim();
}

/**
 * 거래 리스트 행·허브 공용 프리뷰 — viewer 기준 통화 문구 + 실제 message_type 라벨.
 * row-model 과 hub 가 같은 함수를 써서 hub/row previewText 가 일치한다.
 */
export function resolveTradeListItemPreview(
  item: Pick<
    TradeListItem,
    "lastMessage" | "lastMessageType" | "lastMessageIsSystem" | "viewerRole" | "sellerUserId" | "counterpartyUserId"
  >
): DomainPreview {
  const viewerUserId = tradeListItemViewerUserId(item) || null;
  const type = (item.lastMessageType ?? "").trim() || (item.lastMessageIsSystem ? "system" : "text");
  if (TRADE_LIST_LABELED_MESSAGE_TYPES.has(type)) {
    const label = formatCmListPreviewTextForViewer(
      { lastMessage: item.lastMessage, lastMessageType: type as CommunityMessengerMessageType },
      viewerUserId
    );
    return resolveTradePreview({
      content: label,
      messageType: type === "call_stub" ? "system" : "text",
      isSystemAllowed: true,
    });
  }
  return resolveTradePreview({
    content: resolveRoomLastMessageForViewer(item.lastMessage, viewerUserId),
    messageType: type,
    isSystemAllowed: true,
  });
}
