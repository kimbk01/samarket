/**
 * CUT 3 — client event + impression recording with exposure dedupe.
 */

import { markPlatformPopupImpression } from "@/lib/platform-popup/popup-impression-boundary";
import type { PlatformPopupEventType } from "@/lib/platform-popup/types";

const recordedImpressions = new Set<string>();

export function resetPlatformPopupImpressionDedupeForTests(): void {
  recordedImpressions.clear();
}

export type RecordPlatformPopupEventInput = {
  campaignId: string;
  creativeId?: string | null;
  surface?: string | null;
  eventType: PlatformPopupEventType;
  source: "renderer" | "click_handler" | "dismiss_handler";
  exposureId: string;
  deviceKey?: string | null;
  meta?: Record<string, unknown> | null;
};

export async function recordPlatformPopupEvent(
  input: RecordPlatformPopupEventInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (input.eventType === "impression") {
    if (recordedImpressions.has(input.exposureId)) {
      return { ok: false, error: "duplicate_impression_blocked" };
    }
    const gate = markPlatformPopupImpression({
      campaignId: input.campaignId,
      creativeId: String(input.creativeId ?? ""),
      surface: String(input.surface ?? ""),
      source: "renderer",
    });
    if (!gate.ok) return gate;
    recordedImpressions.add(input.exposureId);
  }

  try {
    const res = await fetch("/api/platform-popup/events", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: input.campaignId,
        creativeId: input.creativeId,
        surface: input.surface,
        eventType: input.eventType,
        source: input.source,
        exposureId: input.exposureId,
        deviceKey: input.deviceKey,
        meta: input.meta,
      }),
    });
    if (!res.ok) {
      if (input.eventType === "impression") {
        recordedImpressions.delete(input.exposureId);
      }
      return { ok: false, error: await res.text() };
    }
    return { ok: true };
  } catch (e) {
    if (input.eventType === "impression") {
      recordedImpressions.delete(input.exposureId);
    }
    return { ok: false, error: String(e) };
  }
}
