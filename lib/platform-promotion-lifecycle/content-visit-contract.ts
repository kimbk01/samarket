/**
 * Cross-channel lifecycle — content visit contract.
 * IMPRESSION / DELIVERED / CREATED ≠ OPEN / DESTINATION_OPEN.
 * Coordination key = Event content id + actor + session (not campaign title/URL).
 */

export const PROMOTION_COORDINATION_CHANNELS = ["POPUP", "BANNER", "PUSH", "BELL"] as const;
export type PromotionCoordinationChannel = (typeof PROMOTION_COORDINATION_CHANNELS)[number];

export function isPromotionCoordinationChannel(
  v: string | null | undefined
): v is PromotionCoordinationChannel {
  return (PROMOTION_COORDINATION_CHANNELS as readonly string[]).includes(String(v ?? "").trim());
}

/** Extract Event id from canonical /events/{id} path (query/hash ignored). */
export function extractEventIdFromHref(href: string | null | undefined): string | null {
  const raw = String(href ?? "").trim();
  if (!raw) return null;
  let path = raw;
  try {
    if (/^https?:\/\//i.test(raw)) {
      path = new URL(raw).pathname;
    }
  } catch {
    return null;
  }
  const q = path.indexOf("?");
  if (q >= 0) path = path.slice(0, q);
  const h = path.indexOf("#");
  if (h >= 0) path = path.slice(0, h);
  const m = path.match(/^\/events\/([^/]+)\/?$/i);
  if (!m?.[1]) return null;
  const id = decodeURIComponent(m[1]).trim();
  return id || null;
}

/**
 * Resolve Event id from a popup campaign CTA.
 * event_detail → ctaTarget; internal_page → parse href if /events/{id}.
 */
export function extractEventIdFromPopupCta(input: {
  ctaType?: string | null;
  ctaTarget?: string | null;
  href?: string | null;
}): string | null {
  const type = String(input.ctaType ?? "").trim().toLowerCase();
  if (type === "event_detail") {
    const id = String(input.ctaTarget ?? "").trim();
    return id || null;
  }
  if (type === "internal_page") {
    const fromTarget = extractEventIdFromHref(input.ctaTarget);
    if (fromTarget) return fromTarget;
  }
  return extractEventIdFromHref(input.href);
}
