import type { StoreMenuReviewRailProduct } from "@/lib/stores/build-store-menu-review-rail-products";

export const STORE_REVIEW_PREVIEW_CAROUSEL_MS = 360;
export const STORE_REVIEW_PREVIEW_ROTATE_MS = 4500;
export const STORE_REVIEW_PREVIEW_MAX_SLIDES = 12;

export type StoreReviewPreviewSlide = {
  reviewId: string;
  rating: number;
  content: string;
  thumbUrl: string;
  productId: string | null;
  hasPhoto: boolean;
};

type ReviewRow = {
  id: string;
  rating: number;
  content: string;
  product_id?: string | null;
  image_urls?: string[];
};

function firstReviewImage(imageUrls: unknown): string {
  if (!Array.isArray(imageUrls)) return "";
  for (const raw of imageUrls) {
    const u = String(raw ?? "").trim();
    if (u) return u;
  }
  return "";
}

function menuThumbForProduct(
  productId: string | null,
  menuById: Map<string, StoreMenuReviewRailProduct>
): string {
  if (!productId) return "";
  return menuById.get(productId)?.thumbnail_url?.trim() || "";
}

/** 배민 매장 상단 프리뷰 — 리뷰 1건당 슬라이드 1장(썸네일+별+본문) */
export function buildStoreReviewPreviewSlides(
  reviews: ReviewRow[],
  menuProducts: StoreMenuReviewRailProduct[]
): StoreReviewPreviewSlide[] {
  const menuById = new Map(menuProducts.map((p) => [p.id, p]));
  const out: StoreReviewPreviewSlide[] = [];

  for (const r of reviews) {
    const content = String(r.content ?? "").trim();
    if (!content) continue;
    const reviewId = String(r.id ?? "").trim();
    if (!reviewId) continue;
    const productId = String(r.product_id ?? "").trim() || null;
    const reviewPhoto = firstReviewImage(r.image_urls);
    const menuThumb = menuThumbForProduct(productId, menuById);
    const thumbUrl = reviewPhoto || menuThumb;
    const rating = Math.min(5, Math.max(1, Math.floor(Number(r.rating) || 5)));
    out.push({
      reviewId,
      rating,
      content,
      thumbUrl,
      productId,
      hasPhoto: Boolean(reviewPhoto),
    });
    if (out.length >= STORE_REVIEW_PREVIEW_MAX_SLIDES) break;
  }

  out.sort((a, b) => Number(b.hasPhoto) - Number(a.hasPhoto));
  return out;
}

export function starGlyphs(rating: number): string {
  const n = Math.min(5, Math.max(0, Math.floor(rating)));
  return "★".repeat(n);
}
