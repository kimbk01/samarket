import type { CommunityMessengerRoomContextMetaV1 } from "@/lib/community-messenger/types";
import { formatPrice } from "@/lib/utils/format";

function tradeFlowStatusStepKo(status: string): string {
  const s = status.trim().toLowerCase();
  switch (s) {
    case "chatting":
      return "대화 중";
    case "seller_marked_done":
      return "판매자 완료";
    case "buyer_confirmed":
      return "구매 확정";
    case "review_pending":
      return "후기 대기";
    case "review_completed":
      return "후기 완료";
    case "dispute":
      return "분쟁";
    case "cancelled":
      return "취소됨";
    case "archived":
      return "보관됨";
    default:
      return "거래 진행";
  }
}

/** 거래채팅 → 메신저 목록용 contextMeta (v1). */
export function buildMessengerContextMetaFromProductChatSnapshot(input: {
  productChatId: string;
  productTitle: string;
  price: number | null | undefined;
  currency?: string | null;
  tradeFlowStatus: string;
  thumbnailUrl?: string | null;
}): CommunityMessengerRoomContextMetaV1 {
  const headline = input.productTitle.trim() || "거래";
  const meta: CommunityMessengerRoomContextMetaV1 = {
    v: 1,
    kind: "trade",
    headline,
    productChatId: input.productChatId.trim(),
  };
  if (typeof input.price === "number" && Number.isFinite(input.price) && input.price >= 0) {
    meta.priceLabel = formatPrice(input.price, input.currency?.trim() || "PHP");
  }
  const step = tradeFlowStatusStepKo(input.tradeFlowStatus || "chatting");
  if (step) meta.stepLabel = step;
  if (input.thumbnailUrl === null) {
    meta.thumbnailUrl = null;
  } else if (typeof input.thumbnailUrl === "string" && input.thumbnailUrl.trim()) {
    meta.thumbnailUrl = input.thumbnailUrl.trim();
  }
  return meta;
}
