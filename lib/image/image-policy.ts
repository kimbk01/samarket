/**
 * DIBAY Image V2 — policy layer (Phase 1: passthrough only).
 *
 * Phase 2 will introduce fixed width tiers (avatar 48/96/192, product 320/640/1280, …).
 * Until then every resolver delegates to legacy `lib/media/*` without changing URLs.
 */
export const IMAGE_ADAPTER_PHASE = 1 as const;

/** Phase 1 — legacy URL output must remain byte-identical. */
export const IMAGE_POLICY_PASSTHROUGH = true as const;

export type ImageAdapterPhase = typeof IMAGE_ADAPTER_PHASE;

/** Reserved for Phase 2 tier enforcement — unused in Phase 1. */
export type ImagePolicyMode = "passthrough" | "tier";

export function currentImagePolicyMode(): ImagePolicyMode {
  return IMAGE_POLICY_PASSTHROUGH ? "passthrough" : "tier";
}
