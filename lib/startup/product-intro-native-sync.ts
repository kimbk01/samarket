/**
 * Push Product Intro LKG to Native for next-cold first-entry visual (never blocks App Ready).
 */

import type { ProductIntroConfig } from "@/lib/startup/product-intro";

/** Compact payload Native needs to materialize the same Admin first-entry image. */
export function toNativeProductIntroPayload(config: ProductIntroConfig): Record<string, unknown> {
  return {
    status: config.status,
    mediaUrl: config.media.mobileUrl,
    displayMode: config.displayMode,
    objectFit: config.objectFit,
    sizePreset: config.sizePreset,
    customSizePercent: config.customSizePercent,
    cornerRadiusPx: config.cornerRadiusPx,
    backgroundColor: config.backgroundColor,
    startsAt: config.startsAt,
    endsAt: config.endsAt,
    updatedAt: config.updatedAt,
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
