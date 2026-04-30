/**
 * price_offers PostgREST 행 → 도메인 타입 (방어적).
 * `amount` 컬럼 유무·`normalizeOfferProductId`를 buyer/seller UUID에 적용하는 실수로 행이 폐기되는 것을 막는다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchNicknamesForUserIds } from "@/lib/chats/resolve-author-nickname";
import { normalizeOfferProductId } from "@/lib/offers/normalize-offer-product-id";
import type { PriceOfferListItem, PriceOfferRow } from "@/lib/offers/types";

function str(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  return String(v).trim();
}

function toNumber(value: unknown): number {
  const raw = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(raw) ? raw : NaN;
}

function tsToIsoString(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value).toISOString();
  return "";
}

function toNullableTrimmedString(value: unknown): string | null {
  const t = str(value);
  return t || null;
}

/** DB `price_offers` 한 행 → `PriceOfferRow` (목록·수락/거절 공통) */
export function mapPriceOfferRow(row: Record<string, unknown>): PriceOfferRow | null {
  const id = str(row.id);
  const productId = normalizeOfferProductId(row.product_id) || str(row.product_id);
  const buyer_id = str(row.buyer_id);
  const seller_id =
    str(row.seller_id) ||
    str((row as Record<string, unknown>).seller_user_id) ||
    str((row as Record<string, unknown>).listing_seller_id);
  const createdRaw = tsToIsoString(row.created_at);
  const updatedRaw = tsToIsoString(row.updated_at ?? row.created_at) || createdRaw;
  /** 레거시·트리거 누락 행도 목록에서 폐기하지 않음 */
  const created_at = createdRaw || new Date(0).toISOString();
  const updated_at = updatedRaw || created_at;
  let statusNorm = str(row.status).toLowerCase();
  if (!statusNorm || !["pending", "accepted", "rejected", "expired"].includes(statusNorm)) {
    statusNorm = "pending";
  }
  const status = statusNorm as PriceOfferRow["status"];
  const offeredPrice = toNumber(row.offered_price ?? (row as { amount?: unknown }).amount);
  const originalPrice = toNumber(row.original_price ?? offeredPrice);
  if (!id || !productId || !buyer_id || !seller_id) return null;
  if (!Number.isFinite(originalPrice) || !Number.isFinite(offeredPrice)) return null;
  return {
    id,
    product_id: productId,
    buyer_id,
    seller_id,
    original_price: originalPrice,
    offered_price: offeredPrice,
    message: toNullableTrimmedString(row.message),
    status,
    created_at,
    updated_at,
  };
}

/** `posts` 닉·썸네일 병합 → API `PriceOfferListItem[]` */
export async function enrichPriceOffersToListItems(
  sb: SupabaseClient,
  offers: PriceOfferRow[]
): Promise<PriceOfferListItem[]> {
  if (offers.length === 0) return [];
  const productIds = [...new Set(offers.map((offer) => offer.product_id))];
  const userIds = [...new Set(offers.flatMap((offer) => [offer.buyer_id, offer.seller_id]))];

  const [postsRes, nickMap] = await Promise.all([
    sb.from("posts").select("id, title, thumbnail_url, status").in("id", productIds),
    fetchNicknamesForUserIds(sb, userIds),
  ]);

  const postMap = new Map<string, { title: string; thumbnail_url: string | null; status: string | null }>();
  for (const row of (postsRes.data ?? []) as Record<string, unknown>[]) {
    const pid = normalizeOfferProductId(row.id) || str(row.id);
    if (!pid) continue;
    postMap.set(pid, {
      title: str(row.title) || "상품",
      thumbnail_url: toNullableTrimmedString(row.thumbnail_url),
      status: toNullableTrimmedString(row.status),
    });
  }

  return offers.map((offer) => {
    const post = postMap.get(offer.product_id);
    return {
      id: offer.id,
      productId: offer.product_id,
      buyerId: offer.buyer_id,
      sellerId: offer.seller_id,
      originalPrice: offer.original_price,
      offeredPrice: offer.offered_price,
      message: offer.message,
      status: offer.status,
      createdAt: offer.created_at,
      updatedAt: offer.updated_at,
      productTitle: post?.title ?? "상품",
      productThumbnailUrl: post?.thumbnail_url ?? null,
      productStatus: post?.status ?? null,
      productHref: `/post/${encodeURIComponent(offer.product_id)}`,
      buyerNickname: nickMap.get(offer.buyer_id) ?? null,
      sellerNickname: nickMap.get(offer.seller_id) ?? null,
    };
  });
}
