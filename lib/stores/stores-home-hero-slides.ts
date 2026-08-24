/**
 * @deprecated CUT 5 — REMOVED as runtime Hero authority.
 * Canonical BANNER_AD = `store_banner_ad_campaigns` via
 * `lib/stores/store-banner-ad-exposure.ts` + `/api/stores/home-hero-banners`.
 * Do not import for customer HOME Hero. Kept only so tests can assert removal.
 */

import { storesBrowsePrimaryPath } from "@/components/stores/browse/stores-browse-paths";
import type { MessageKey } from "@/lib/i18n/messages";

export type StoresHomeHeroSlide = {
  id: string;
  href: string;
  eyebrowKey: MessageKey;
  titleKey: MessageKey;
  subtitleKey: MessageKey;
  bg: string;
};

/** @deprecated Static dual authority — not consumed by StoresHomeHeroBanner after CUT 5. */
export const STORES_HOME_HERO_SLIDES: StoresHomeHeroSlide[] = [
  {
    id: "browse-food",
    href: storesBrowsePrimaryPath("restaurant"),
    eyebrowKey: "store_promo_eyebrow",
    titleKey: "store_promo_title",
    subtitleKey: "store_promo_subtitle",
    bg: "linear-gradient(135deg, var(--dibay-green) 0%, var(--dibay-brown) 100%)",
  },
  {
    id: "browse-mart",
    href: storesBrowsePrimaryPath("mart"),
    eyebrowKey: "store_feed_eyebrow",
    titleKey: "store_more_food_link",
    subtitleKey: "store_order_now_subtitle",
    bg: "linear-gradient(135deg, color-mix(in srgb, var(--dibay-green) 88%, var(--dibay-card)) 0%, var(--dibay-green) 100%)",
  },
];
