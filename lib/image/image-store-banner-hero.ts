/**
 * Store menu hero banner — upload-time .hero.webp derivative (no runtime transform).
 */
import {
  DELIVERY_DETAIL_HERO_FETCH_HEIGHT_PX,
  DELIVERY_DETAIL_HERO_QUALITY,
} from "@/lib/image/image-size";
import { resolveCanonicalHeroImageUrl } from "@/lib/media/canonical-image-resolver";

export const STORE_BANNER_HERO_FETCH_WIDTH_PX = 1280;

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

export function imageBuildStoreBannerHeroFetchUrl(raw: string | null | undefined): string | null {
  return resolveCanonicalHeroImageUrl(raw);
}

export function loadStoreBannerHeroFetchUrl(raw: string | null | undefined): string | null {
  return imageBuildStoreBannerHeroFetchUrl(raw);
}
