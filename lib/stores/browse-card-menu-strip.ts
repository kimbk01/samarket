/**
 * WP5 (배민형 2차수 2026-10-29) — 업종 목록 카드 메뉴 사진 가로 줄 순수 로직.
 * 화면: `components/stores/browse/StoreBrowseCategoryRowCard.tsx`
 * 명세: `docs/audit/delivery-baemin-master-plan-2026-10-29.md` WP5
 */
import { STORES_BROWSE_CATEGORY_PRESENTATION } from "@/lib/stores/stores-browse-category-presentation-spec";

export type BrowseCardMenuStripSourceItem = {
  productId: string;
  name: string;
  price: number;
  discountPrice?: number | null;
  imageUrl?: string | null;
};

export type BrowseCardMenuStripPhoto = {
  productId: string;
  name: string;
  imageUrl: string;
  price: MenuPriceDisplay;
};

export type BrowseCardMenuStrip = {
  photos: BrowseCardMenuStripPhoto[];
  /** 사진이 1장 이상이면 마지막에 「더보기」 타일 */
  showMoreTile: boolean;
};

/** 사진 줄 최대 장수 (더보기 타일 제외) */
export const BROWSE_CARD_MENU_STRIP_MAX_PHOTOS = STORES_BROWSE_CATEGORY_PRESENTATION.menuTileVisibleCount;

export type MenuPriceDisplay = {
  /** 굵게 보여 줄 실제 판매가 */
  currentPhp: number;
  /** 할인 중일 때만 — 취소선 원가 */
  originalPhp: number | null;
};

function safePhp(n: unknown): number | null {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return null;
  return Math.max(0, Math.round(v));
}

/**
 * 가격 표시 — 할인가가 원가보다 작고 0 이상일 때만 「할인가 굵게 + 원가 취소선」.
 * 그 외(할인 없음·잘못된 값)는 원가 한 줄.
 */
export function resolveMenuPriceDisplay(price: unknown, discountPrice?: unknown): MenuPriceDisplay {
  const base = safePhp(price) ?? 0;
  const disc = discountPrice == null ? null : safePhp(discountPrice);
  if (disc != null && disc < base) {
    return { currentPhp: disc, originalPhp: base };
  }
  return { currentPhp: base, originalPhp: null };
}

/** 서버 조립용 — 의미 있는 할인가만 남김 (원가 이상·음수·NaN → null) */
export function normalizeBrowseFeaturedDiscountPrice(price: unknown, discountPrice: unknown): number | null {
  if (discountPrice == null) return null;
  const d = resolveMenuPriceDisplay(price, discountPrice);
  return d.originalPhp != null ? d.currentPhp : null;
}

/** 카드 데이터 → 사진 줄 (사진 있는 메뉴만, 서버 순서 유지, 최대 6장) */
export function buildBrowseCardMenuStrip(
  items: readonly BrowseCardMenuStripSourceItem[],
  max: number = BROWSE_CARD_MENU_STRIP_MAX_PHOTOS
): BrowseCardMenuStrip {
  const photos: BrowseCardMenuStripPhoto[] = [];
  for (const x of items) {
    if (photos.length >= max) break;
    const url = typeof x.imageUrl === "string" ? x.imageUrl.trim() : "";
    if (!url) continue;
    photos.push({
      productId: x.productId,
      name: x.name,
      imageUrl: url,
      price: resolveMenuPriceDisplay(x.price, x.discountPrice),
    });
  }
  return { photos, showMoreTile: photos.length > 0 };
}
