/**
 * Store menu hero banner (`StoreOwnerBannerCarousel` → `HeroSlideCover` CSS background).
 *
 * Measurement basis (`#store-hero-media` = clamp(13rem, 44vh, 18rem) full-bleed width):
 * | profile        | viewport | DPR | displayW | displayH | reqW (×DPR×2.25) | reqH |
 * | mobile_430     | 430×932  | 2   | 430      | 288      | 1935             | 1296 |
 * | Pixel 5        | 393×727  | 2.75| 393      | 288      | ~2430            | ~1782|
 * | iPhone 13      | 390×664  | 3   | 390      | 288      | ~2633            | ~1944|
 * | desktop_1280   | col~430  | 2   | ≤430     | 288      | ≤1935            | ≤1296|
 *
 * Fixed preset (no runtime calc): width 960 × height 720 × q80 — same fetch box as
 * `buildStoreProductHeroFetchUrl` / `#store-hero-media` LCP hero; covers 2× DPR at
 * max clamp height without changing `DeliveryMediaImage` detail-hero policy.
 */
import {
  DELIVERY_DETAIL_HERO_FETCH_HEIGHT_PX,
  DELIVERY_DETAIL_HERO_QUALITY,
} from "@/lib/image/image-size";
import { imageBuildStoreProductTransformUrl } from "@/lib/image/image-transform";

export const STORE_BANNER_HERO_FETCH_WIDTH_PX = 960;

export const STORE_BANNER_HERO_MEASUREMENT = {
  displayWidthPx: 430,
  displayHeightPx: 288,
  devicePixelRatio: 2,
  requiredFetchWidthPx: 1935,
  requiredFetchHeightPx: 1296,
  presetFetchWidthPx: STORE_BANNER_HERO_FETCH_WIDTH_PX,
  presetFetchHeightPx: DELIVERY_DETAIL_HERO_FETCH_HEIGHT_PX,
  presetQuality: DELIVERY_DETAIL_HERO_QUALITY,
} as const;

/** object/public → render/image for store-product-images banner hero background. */
export function imageBuildStoreBannerHeroFetchUrl(raw: string | null | undefined): string | null {
  return imageBuildStoreProductTransformUrl(raw, {
    width: STORE_BANNER_HERO_FETCH_WIDTH_PX,
    height: DELIVERY_DETAIL_HERO_FETCH_HEIGHT_PX,
    quality: DELIVERY_DETAIL_HERO_QUALITY,
  });
}

export function loadStoreBannerHeroFetchUrl(raw: string | null | undefined): string | null {
  return imageBuildStoreBannerHeroFetchUrl(raw);
}
