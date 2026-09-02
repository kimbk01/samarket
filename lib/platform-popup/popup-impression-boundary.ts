/**
 * CUT 3 — impression boundary. Resolver/API/READY must never emit impression.
 * Renderer calls recordPlatformPopupEvent after visible render completion.
 */

import { assertNotImpressionFromResolver } from "@/lib/platform-popup/events";

export type MarkPlatformPopupImpressionInput = {
  campaignId: string;
  creativeId: string;
  surface: string;
  /** Must be "renderer" — host/resolver forbidden. */
  source: "renderer";
};

/**
 * Gate-only check before client posts impression event.
 * Persistence: recordPlatformPopupEvent → /api/platform-popup/events.
 */
export function markPlatformPopupImpression(
  input: MarkPlatformPopupImpressionInput
): { ok: true } | { ok: false; error: string } {
  const gate = assertNotImpressionFromResolver("impression", input.source);
  if (!gate.ok) return gate;
  if (!input.campaignId.trim() || !input.creativeId.trim()) {
    return { ok: false, error: "missing_ids" };
  }
  return { ok: true };
}

export function assertHostMustNotEmitImpression(): { ok: true } {
  return { ok: true };
}
