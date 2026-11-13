/**
 * MARKET 상품 상세 링크 미리보기(OG) — 통합 공유 S4.
 * 설계: docs/audit/dibay-unified-share-audit-design-2026-11-14.md §D-6.
 *
 * - 공개 필드만: 제목 · 가격(또는 나눔) · 동네 · 대표 사진. 전화번호·정확 주소·판매자 정보 넣지 않음.
 * - 숨김·삭제·없는 글 = 앱 기본 제목 + 검색 제외(존재 여부를 미리보기로 드러내지 않음).
 * - 데이터는 상세 페이지와 같은 요청 안에서 같은 결과를 쓴다(추가 DB 조회 없음 — 호출부 `cache()`).
 */
import type { Metadata } from "next";
import type { PostWithMeta } from "@/lib/posts/schema";
import { imageResolveTradePostDetailImageUrls } from "@/lib/image";
import { resolveTradePostListingLocationLine } from "@/lib/posts/post-listing-location-label";
import { resolveTradePostCurrency } from "@/lib/trade/trade-price-currency";
import { formatPrice } from "@/lib/utils/format";
import { buildShareUrl } from "@/lib/share/share-url";

export function buildUnavailableSharePageMetadata(): Metadata {
  return { robots: { index: false, follow: false } };
}

export function buildTradePostPageMetadata(
  item: PostWithMeta,
  labels: { freeShare: string }
): Metadata {
  const url = buildShareUrl({ kind: "market", postId: item.id });
  const title = (item.title ?? "").trim();
  if (!url || !title) return {};

  const meta =
    item.meta && typeof item.meta === "object" && !Array.isArray(item.meta)
      ? (item.meta as Record<string, unknown>)
      : null;
  const priceText = item.is_free_share
    ? labels.freeShare
    : item.price != null
      ? formatPrice(item.price, resolveTradePostCurrency(item.meta, "PHP"))
      : "";
  const locationText = resolveTradePostListingLocationLine(meta, item.region, item.city, item.trade_lgu_id) || "";
  const description = [priceText, locationText].filter(Boolean).join(" · ") || undefined;
  const image = imageResolveTradePostDetailImageUrls(item).find((u) => /^https:\/\//i.test(u ?? ""));
  const images = image ? [image] : undefined;

  return {
    title,
    ...(description ? { description } : {}),
    openGraph: {
      title,
      ...(description ? { description } : {}),
      url,
      type: "website",
      ...(images ? { images } : {}),
    },
    twitter: {
      card: images ? "summary_large_image" : "summary",
      title,
      ...(description ? { description } : {}),
      ...(images ? { images } : {}),
    },
    alternates: { canonical: url },
  };
}
