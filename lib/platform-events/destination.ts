/**
 * Destination resolver helpers for Event Detail.
 * Renderers must not assemble `/events/...` themselves — use these.
 */

import { buildPlatformEventDetailPath } from "@/lib/platform-events/types";
import { validatePlatformPopupCta } from "@/lib/platform-popup/cta";

export function resolveEventDetailHref(eventId: string): string | null {
  const id = String(eventId ?? "").trim();
  if (!id) return null;
  return buildPlatformEventDetailPath(id);
}

/** Resolve Event-owned final CTA via shared popup CTA validator (same destination SSOT). */
export function resolvePlatformEventFinalCtaHref(input: {
  ctaType?: string | null;
  ctaTarget?: string | null;
  externalUrl?: string | null;
}): { ok: true; href: string; labelReady: true } | { ok: false; error: string } {
  const type = String(input.ctaType ?? "").trim();
  if (!type) return { ok: false, error: "cta_missing" };
  // Event must not deep-link to another Event Detail as primary (avoid loops).
  if (type === "event_detail") return { ok: false, error: "event_detail_loop_forbidden" };
  const v = validatePlatformPopupCta({
    ctaType: type,
    ctaTarget: input.ctaTarget,
    externalUrl: input.externalUrl,
  });
  if (!v.ok) return { ok: false, error: v.error };
  return { ok: true, href: v.value.href, labelReady: true };
}
