/**
 * Push Product Intro LKG to Native for next-cold First Entry (never blocks App Ready).
 * V2: Web visual owner = 0. Native CONTAIN canvas only.
 */

import type { ProductIntroConfig } from "@/lib/startup/product-intro";
import {
  productIntroEnterMotionMs,
  productIntroExitMotionMs,
} from "@/lib/startup/product-intro";

/** Stable generation identity for atomic Native materialization. */
export function productIntroGenerationId(config: ProductIntroConfig): string {
  const url = config.media.mobileUrl ?? "";
  return [
    config.updatedAt,
    url,
    config.backgroundColor,
    config.sizePreset,
    config.animationIn,
    config.animationOut,
    config.startsAt ?? "",
    config.endsAt ?? "",
  ].join("|");
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
    presentationSizePreset: config.sizePreset,
    sizePreset: config.sizePreset,
    customSizePercent: null,
    cornerRadiusPx: 0,
    enterMotion: config.animationIn,
    exitMotion: config.animationOut,
    enterDurationMs: productIntroEnterMotionMs(config.animationIn),
    exitDurationMs: productIntroExitMotionMs(config.animationOut),
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
