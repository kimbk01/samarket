/**
 * Platform Popup CUT 1 — event authority helpers.
 * Hard rule: resolver/API response != impression.
 */

import type { PlatformPopupEventType } from "@/lib/platform-popup/types";

export const PLATFORM_POPUP_RESOLVER_SAFE_EVENT_TYPES = ["eligible"] as const;

export function isPlatformPopupImpressionEvent(type: PlatformPopupEventType | string): boolean {
  return type === "impression";
}

/**
 * Resolver / eligibility API must not emit impression.
 * Only production renderer (later CUT) may confirm on-screen render completion.
 */
export function assertNotImpressionFromResolver(
  eventType: PlatformPopupEventType | string,
  source: "resolver" | "api_eligibility" | "renderer"
): { ok: true } | { ok: false; error: string } {
  if (isPlatformPopupImpressionEvent(eventType) && source !== "renderer") {
    return { ok: false, error: "api_response_as_impression_blocked" };
  }
  return { ok: true };
}

export function canEmitPlatformPopupEventFromSource(
  eventType: PlatformPopupEventType,
  source: "resolver" | "api_eligibility" | "renderer" | "click_handler" | "dismiss_handler"
): boolean {
  if (eventType === "impression") return source === "renderer";
  if (eventType === "eligible") {
    return source === "resolver" || source === "api_eligibility";
  }
  if (eventType === "click" || eventType === "landing_success" || eventType === "landing_failure") {
    return source === "click_handler" || source === "renderer";
  }
  if (eventType === "dismiss" || eventType === "suppress") {
    return source === "dismiss_handler" || source === "renderer";
  }
  return false;
}
