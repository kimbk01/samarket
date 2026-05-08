import type { CommunityMessengerRoomContextMetaV1 } from "@/lib/community-messenger/types";
import { getChatListingItemStateLabel } from "@/lib/products/seller-listing-state";
import { formatPrice } from "@/lib/utils/format";

/** home-sync 다방 동일 가격·통화 반복 시 toLocaleString churn 완화 — 요청 간 공유·상한만 둠 */
const MESSENGER_SNAPSHOT_PRICE_LABEL_CACHE_CAP = 256;
const messengerSnapshotPriceLabelCache = new Map<string, string>();

function priceLabelForMessengerSnapshot(price: number, currencyCode: string): string {
  const code = currencyCode.toUpperCase();
  const key = `${Math.round(price)}:${code}`;
  const hit = messengerSnapshotPriceLabelCache.get(key);
  if (hit !== undefined) return hit;
  const label = formatPrice(price, code);
  if (messengerSnapshotPriceLabelCache.size >= MESSENGER_SNAPSHOT_PRICE_LABEL_CACHE_CAP) {
    const oldest = messengerSnapshotPriceLabelCache.keys().next().value as string | undefined;
    if (oldest !== undefined) messengerSnapshotPriceLabelCache.delete(oldest);
  }
  messengerSnapshotPriceLabelCache.set(key, label);
  return label;
}

/** `String(x)` 없이 선택 문자열 정규화 — 목록 스냅샷 핫패스 할당 최소화 */
function trimmedMetaString(input: string | null | undefined): string | undefined {
  if (input == null || input === "") return undefined;
  const t = input.trim();
  return t.length ? t : undefined;
}

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
  /**
   * `buildTradeMessengerListContextMetaFromLoadedPost` 등 — headline·카테고리·통화·썸네일·
   * `productChatId`/`postId` 가 호출부에서 이미 정규화된 경우 재-trim 생략(`tradeFlowStatus` 등은 유지).
   */
  listDisplayStringsAlreadyNormalized?: boolean;
}): CommunityMessengerRoomContextMetaV1 {
  const trustListStrings = Boolean(input.listDisplayStringsAlreadyNormalized);
  const headline = trustListStrings
    ? input.productTitle || "거래"
    : input.productTitle.trim() || "거래";
  const meta: CommunityMessengerRoomContextMetaV1 = {
    v: 1,
    kind: "trade",
    headline,
    productChatId: trustListStrings ? input.productChatId : input.productChatId.trim(),
  };
  const postId =
    typeof input.postId === "string" ? (trustListStrings ? input.postId : input.postId.trim()) : "";
  if (postId) meta.postId = postId;
  if (typeof input.price === "number" && Number.isFinite(input.price) && input.price >= 0) {
    let currencyCode = "PHP";
    const cur = input.currency;
    if (typeof cur === "string") {
      if (trustListStrings && cur.length > 0) {
        currencyCode = cur;
      } else {
        const ct = cur.trim();
        if (ct.length) currencyCode = ct;
      }
    }
    meta.priceLabel = priceLabelForMessengerSnapshot(input.price, currencyCode);
  }
  meta.roleLabel = input.role === "seller" ? "판매자" : "구매자";
  const itemStateLabel = getChatListingItemStateLabel(input.sellerListingStateRaw, input.postStatus ?? undefined);
  if (itemStateLabel) meta.itemStateLabel = itemStateLabel;
  if (input.thumbnailUrl === null) {
    meta.thumbnailUrl = null;
  } else if (typeof input.thumbnailUrl === "string") {
    if (trustListStrings) {
      // loaded-post 경로: `extractPostThumbnailPathFromPostRow` 가 이미 trim 된 경로만 반환
      if (input.thumbnailUrl.length > 0) meta.thumbnailUrl = input.thumbnailUrl;
    } else {
      const thumb = input.thumbnailUrl.trim();
      if (thumb.length) meta.thumbnailUrl = thumb;
    }
  }
  const flow = trimmedMetaString(input.tradeFlowStatus);
  if (flow) meta.tradeFlowStatus = flow;
  if (trustListStrings) {
    if (input.categoryMenuLabel) meta.categoryMenuLabel = input.categoryMenuLabel;
    if (input.productCategoryLabel) meta.productCategoryLabel = input.productCategoryLabel;
    if (input.sellerDisplayName) meta.sellerDisplayName = input.sellerDisplayName;
  } else {
    const categoryMenuLabel = trimmedMetaString(input.categoryMenuLabel);
    if (categoryMenuLabel) meta.categoryMenuLabel = categoryMenuLabel;
    const productCategoryLabel = trimmedMetaString(input.productCategoryLabel);
    if (productCategoryLabel) meta.productCategoryLabel = productCategoryLabel;
    const sellerDisplayName = trimmedMetaString(input.sellerDisplayName);
    if (sellerDisplayName) meta.sellerDisplayName = sellerDisplayName;
  }
  return meta;
}
