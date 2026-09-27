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
    config.campaignId ?? "",
    config.updatedAt,
    url,
    config.backgroundColor,
    config.sizePreset,
    String(config.displayDurationMs),
    config.skipEnabled ? "1" : "0",
    config.showLogo ? "1" : "0",
    config.frequencyMode,
    config.action.type,
    config.action.target,
    config.startsAt ?? "",
    config.endsAt ?? "",
  ].join("|");
}

/** Compact payload Native needs to materialize the same Admin first-entry image. */
export function toNativeProductIntroPayload(config: ProductIntroConfig): Record<string, unknown> {
  return {
    status: config.status,
    campaignId: config.campaignId,
    mediaUrl: config.media.mobileUrl,
    mediaWidth: config.mediaWidth,
    mediaHeight: config.mediaHeight,
    generationId: productIntroGenerationId(config),
    updatedAt: config.updatedAt,
    displayMode: "fullscreen",
    objectFit: "contain",
    presentationSizePreset: config.sizePreset,
    sizePreset: config.sizePreset,
    customSizePercent: null,
    cornerRadiusPx: 0,
    enterMotion: config.animationIn,
    exitMotion: config.animationOut,
    enterDurationMs: productIntroEnterMotionMs(config.animationIn),
    displayDurationMs: config.displayDurationMs,
    exitDurationMs: productIntroExitMotionMs(config.animationOut),
    skipEnabled: config.skipEnabled,
    showLogo: config.showLogo,
    frequencyMode: config.frequencyMode,
    ctaLabel: config.ctaLabel,
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
