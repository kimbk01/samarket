/**
 * DIBAY Image V2 — policy layer (Phase 2B: upload-time derivatives, zero runtime transform).
 */
import { IMAGE_AVATAR_TIERS, IMAGE_MESSENGER_TIERS, IMAGE_PRODUCT_TIERS } from "@/lib/image/image-tier";

export const IMAGE_ADAPTER_PHASE = 2 as const;
export const IMAGE_POLICY_PASSTHROUGH = false as const;

export type ImageAdapterPhase = typeof IMAGE_ADAPTER_PHASE;
export type ImagePolicyMode = "passthrough" | "derivative";
export type ImagePolicyDomain = "avatar" | "product" | "delivery" | "community" | "messenger";

export function currentImagePolicyMode(): ImagePolicyMode {
  return "derivative";
}

export const IMAGE_POLICY_TIERS: Record<ImagePolicyDomain, readonly number[]> = {
  avatar: IMAGE_AVATAR_TIERS,
  product: IMAGE_PRODUCT_TIERS,
  delivery: IMAGE_PRODUCT_TIERS,
  community: IMAGE_PRODUCT_TIERS,
  messenger: IMAGE_MESSENGER_TIERS,
};

const STORE_PRODUCT_HERO_PRESETS = new Set<string>(["detailHero", "heroTransition"]);

export function shouldStoreProductThumbUseObjectPublic(preset?: string): boolean {
  if (preset == null) return true;
  return !STORE_PRODUCT_HERO_PRESETS.has(preset);
}

export function isStoreProductHeroPreset(preset: string): boolean {
  return STORE_PRODUCT_HERO_PRESETS.has(preset);
}

export function shouldPostImageListUseTierTransform(): boolean {
  return false;
}

export function shouldUseLargeImageTransform(): boolean {
  return false;
}
