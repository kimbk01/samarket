import type { CommunityMessengerRoomContextMetaV1 } from "@/lib/community-messenger/types";
import { getChatListingBoxPresentation } from "@/lib/products/seller-listing-state";
import { formatPrice } from "@/lib/utils/format";

/** 거래채팅 → 메신저 목록용 contextMeta (v1). */
export function buildMessengerContextMetaFromProductChatSnapshot(input: {
  productChatId: string;
  /** `posts.id` — 클라이언트가 거래 글 Realtime 구독 시 사용 */
  postId?: string;
  productTitle: string;
  price: number | null | undefined;
  currency?: string | null;
  /** 내 역할 (seller/buyer) */
  role: "seller" | "buyer";
  sellerListingStateRaw?: unknown;
  postStatus?: string | null;
  thumbnailUrl?: string | null;
  /** `product_chats.trade_flow_status` */
  tradeFlowStatus?: string | null;
  /** `/market` 홈칩과 정합한 거래 대메뉴 라벨 */
  categoryMenuLabel?: string | null;
  /** `categories`/`trade_categories` 의 leaf 표시명 — 목록 1행 칩 우선 */
  productCategoryLabel?: string | null;
  /** 목록 4행 — 판매자/작성자 프로필 표시명(서버 enrich) */
  sellerDisplayName?: string | null;
}): CommunityMessengerRoomContextMetaV1 {
  const headline = input.productTitle.trim() || "거래";
  const meta: CommunityMessengerRoomContextMetaV1 = {
    v: 1,
    kind: "trade",
    headline,
    productChatId: input.productChatId.trim(),
  };
  const postId = typeof input.postId === "string" ? input.postId.trim() : "";
  if (postId) meta.postId = postId;
  if (typeof input.price === "number" && Number.isFinite(input.price) && input.price >= 0) {
    meta.priceLabel = formatPrice(input.price, input.currency?.trim() || "PHP");
  }
  meta.roleLabel = input.role === "seller" ? "판매자" : "구매자";
  const pres = getChatListingBoxPresentation(input.sellerListingStateRaw, input.postStatus ?? undefined);
  if (pres.label) meta.itemStateLabel = pres.label;
  if (input.thumbnailUrl === null) {
    meta.thumbnailUrl = null;
  } else if (typeof input.thumbnailUrl === "string" && input.thumbnailUrl.trim()) {
    meta.thumbnailUrl = input.thumbnailUrl.trim();
  }
  const flow = String(input.tradeFlowStatus ?? "").trim();
  if (flow) meta.tradeFlowStatus = flow;
  const categoryMenuLabel = String(input.categoryMenuLabel ?? "").trim();
  if (categoryMenuLabel) meta.categoryMenuLabel = categoryMenuLabel;
  const productCategoryLabel = String(input.productCategoryLabel ?? "").trim();
  if (productCategoryLabel) meta.productCategoryLabel = productCategoryLabel;
  const sellerDisplayName = String(input.sellerDisplayName ?? "").trim();
  if (sellerDisplayName) meta.sellerDisplayName = sellerDisplayName;
  return meta;
}
