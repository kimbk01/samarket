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

/**
 * 거래방 contextMeta `roleLabel` — 보는 사람 역할 **저장 토큰** SSOT (화면 문구 아님).
 * `messengerTradeViewerRoleFromContextMeta` 가 이 두 값만 판매자/구매자로 인식하고, 운영 방 summary 에도
 * 이 값으로 저장돼 있어 토큰은 바꾸지 않는다. 화면에 그릴 때는 `tradeContextMetaRoleLabelKey` 로 키를 얻어 `t()` 한다.
 */
const TRADE_ROLE_TOKEN_SELLER = "판매자";
const TRADE_ROLE_TOKEN_BUYER = "구매자";

export function tradeContextMetaRoleLabel(role: "seller" | "buyer"): string {
  return role === "seller" ? TRADE_ROLE_TOKEN_SELLER : TRADE_ROLE_TOKEN_BUYER;
}

/** 저장된 `roleLabel` 토큰(또는 이미 번역된 값) → 화면 문구 키. 모르는 값이면 null */
export function tradeContextMetaRoleLabelKey(
  roleLabel: string | null | undefined
): "cm_ui_trade_role_seller" | "cm_ui_trade_role_buyer" | null {
  const r = (roleLabel ?? "").trim();
  if (!r) return null;
  if (r === TRADE_ROLE_TOKEN_SELLER || r.toLowerCase() === "seller") return "cm_ui_trade_role_seller";
  if (r === TRADE_ROLE_TOKEN_BUYER || r.toLowerCase() === "buyer") return "cm_ui_trade_role_buyer";
  return null;
}

/**
 * 거래방 진입 감사 D5 (2026-11-16): 방 `summary` 의 roleLabel 은 방을 만들 때 한쪽 시점으로 1회 저장된다
 * (운영 거래방 대부분 「구매자」 고정). 방 데이터를 내려줄 때 보는 사람 기준으로 다시 정한다.
 * 판매자 id 는 방 `domain_identity`(`trade:{글}:{판매자}:{상대}`)에서 읽는다 — 추가 조회 없음.
 * 정체성이 없거나(옛 방) 보는 사람이 두 당사자가 아니면 저장값 그대로.
 */
export function resolveTradeContextMetaForViewer(
  meta: CommunityMessengerRoomContextMetaV1 | null,
  viewerUserId: string,
  domainIdentity: string | null | undefined
): CommunityMessengerRoomContextMetaV1 | null {
  if (!meta || meta.kind !== "trade") return meta;
  const viewer = viewerUserId.trim();
  const parts = (domainIdentity ?? "").trim().split(":");
  if (!viewer || parts.length !== 4 || parts[0] !== "trade") return meta;
  const sellerUserId = parts[2]!.trim();
  const counterpartyUserId = parts[3]!.trim();
  if (!sellerUserId || !counterpartyUserId) return meta;
  const role = viewer === sellerUserId ? "seller" : viewer === counterpartyUserId ? "buyer" : null;
  if (!role) return meta;
  const roleLabel = tradeContextMetaRoleLabel(role);
  return meta.roleLabel === roleLabel ? meta : { ...meta, roleLabel };
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
  /** 제목 없으면 headline 생략 — 화면이 `cm_ui_trade_headline_fallback` 키로 그림 */
  const headline = trustListStrings ? input.productTitle : input.productTitle.trim();
  const meta: CommunityMessengerRoomContextMetaV1 = {
    v: 1,
    kind: "trade",
    ...(headline ? { headline } : {}),
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
  meta.roleLabel = tradeContextMetaRoleLabel(input.role);
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
