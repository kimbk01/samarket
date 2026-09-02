/**
 * CUT 2 — impression boundary. Resolver/API/READY must never emit impression.
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
 * Production renderer (CUT 3) calls this after on-screen render completion.
 * CUT 2 host must not call this.
 */
export function markPlatformPopupImpression(
  input: MarkPlatformPopupImpressionInput
): { ok: true } | { ok: false; error: string } {
  const gate = assertNotImpressionFromResolver("impression", input.source);
  if (!gate.ok) return gate;
  if (!input.campaignId.trim() || !input.creativeId.trim()) {
    return { ok: false, error: "missing_ids" };
  }
  // Persistence is CUT 3 / later analytics wire — boundary only for CUT 2.
  return { ok: true };
}

export function assertHostMustNotEmitImpression(): { ok: true } {
  return { ok: true };
}
