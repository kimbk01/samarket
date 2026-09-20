"use client";

import { ensureClientInstanceId } from "@/lib/auth/client-instance-id";
import { getOrCreatePlatformPopupAppSessionId } from "@/lib/platform-popup/popup-app-session";
import {
  extractEventIdFromHref,
  isPromotionCoordinationChannel,
  type PromotionCoordinationChannel,
} from "@/lib/platform-promotion-lifecycle/content-visit-contract";

/**
 * Fire-and-forget client writer. Never blocks navigation.
 * Only promotion coordination channels; DIRECT is ignored.
 */
export function recordPromotionContentVisitClient(input: {
  hrefOrEventId: string;
  sourceChannel: PromotionCoordinationChannel | string;
  distributionId?: string | null;
}): void {
  const channel = String(input.sourceChannel ?? "").trim();
  if (!isPromotionCoordinationChannel(channel)) return;

  const raw = String(input.hrefOrEventId ?? "").trim();
  if (!raw) return;
  const eventId = raw.startsWith("/") || raw.includes("://") ? extractEventIdFromHref(raw) : raw;
  if (!eventId) return;

  const sessionKey = getOrCreatePlatformPopupAppSessionId();
  const deviceKey = ensureClientInstanceId();

  void fetch("/api/platform-promotion/content-visit", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eventId,
      sourceChannel: channel,
      sessionKey,
      deviceKey,
      distributionId: input.distributionId ?? null,
    }),
  }).catch((err) => {
    console.error("[promotion-lifecycle] content_visit_client_failed", err);
  });
}

export function reconcileGuestPromotionLifecycleClient(): void {
  const deviceKey = ensureClientInstanceId();
  if (!deviceKey) return;
  void fetch("/api/platform-promotion/reconcile-guest", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceKey }),
  }).catch((err) => {
    console.error("[promotion-lifecycle] reconcile_guest_client_failed", err);
  });
}
