/**
 * DIBAY Image V2 — policy layer (Phase 2A: tier snap + object/public list thumbs).
 *
 * Phase 2A goals:
 * - Store-product list/card → stable object/public (WebP upload pipeline already shrinks bytes)
 * - Post-images list/card → tier-snapped transform (320 / 640 / 1280 only)
 * - Hero / detail / banner → transform at 1280 tier (legacy fallback until Phase 2B upload thumbs)
 */
import { IMAGE_AVATAR_TIERS, IMAGE_MESSENGER_TIERS, IMAGE_PRODUCT_TIERS } from "@/lib/image/image-tier";

export const IMAGE_ADAPTER_PHASE = 2 as const;

/** Phase 2A — tier snap active (no longer byte-identical to Phase 1). */
export const IMAGE_POLICY_PASSTHROUGH = false as const;

export type ImageAdapterPhase = typeof IMAGE_ADAPTER_PHASE;

export type ImagePolicyMode = "passthrough" | "tier";

export type ImagePolicyDomain = "avatar" | "product" | "delivery" | "community" | "messenger";

export function currentImagePolicyMode(): ImagePolicyMode {
  return IMAGE_POLICY_PASSTHROUGH ? "passthrough" : "tier";
}

/** Approved tier sets per domain (2026-06-26 signoff). */
export const IMAGE_POLICY_TIERS: Record<ImagePolicyDomain, readonly number[]> = {
  avatar: IMAGE_AVATAR_TIERS,
  product: IMAGE_PRODUCT_TIERS,
  delivery: IMAGE_PRODUCT_TIERS,
  community: IMAGE_PRODUCT_TIERS,
  messenger: IMAGE_MESSENGER_TIERS,
};

const STORE_PRODUCT_HERO_PRESETS = new Set<string>(["detailHero", "heroTransition"]);

/** Store-product list/card/row thumbs — object/public, no runtime transform. */
export function shouldStoreProductThumbUseObjectPublic(preset?: string): boolean {
  if (preset == null) return true;
  return !STORE_PRODUCT_HERO_PRESETS.has(preset);
}

export function isStoreProductHeroPreset(preset: string): boolean {
  return STORE_PRODUCT_HERO_PRESETS.has(preset);
}

/** Post-images feed/card — tier transform until Phase 2B upload thumbs exist. */
export function shouldPostImageListUseTierTransform(): boolean {
  return currentImagePolicyMode() === "tier";
}

/** Explicit large surfaces (detail gallery, hero, banner) — transform allowed at 1280 tier. */
export function shouldUseLargeImageTransform(): boolean {
  return true;
}
