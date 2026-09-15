/**
 * Push Product Intro LKG to Native for next-cold First Entry (never blocks App Ready).
 * V2: Web visual owner = 0. Native CONTAIN canvas only.
 */

import type { ProductIntroConfig } from "@/lib/startup/product-intro";

/** Stable generation identity for atomic Native materialization. */
export function productIntroGenerationId(config: ProductIntroConfig): string {
  const url = config.media.mobileUrl ?? "";
  return `${config.updatedAt}|${url}`;
}

/** Compact payload Native needs to materialize the same Admin first-entry image. */
export function toNativeProductIntroPayload(config: ProductIntroConfig): Record<string, unknown> {
  return {
    status: config.status,
    mediaUrl: config.media.mobileUrl,
    generationId: productIntroGenerationId(config),
    updatedAt: config.updatedAt,
    // V2 fixed contract — legacy cover/card fields ignored by Native.
    displayMode: "fullscreen",
    objectFit: "contain",
    sizePreset: "full",
    customSizePercent: null,
    cornerRadiusPx: 0,
    backgroundColor: config.backgroundColor,
    startsAt: config.startsAt,
    endsAt: config.endsAt,
    actionType: config.action.type,
    actionTarget: config.action.target,
  };
}

export function syncProductIntroToNative(config: ProductIntroConfig): void {
  if (typeof window === "undefined") return;
  try {
    const bridge = window.DibayBootBridge;
    if (!bridge?.persistProductIntro) return;
    bridge.persistProductIntro(JSON.stringify(toNativeProductIntroPayload(config)));
  } catch {
    /* web / missing bridge */
  }
}
