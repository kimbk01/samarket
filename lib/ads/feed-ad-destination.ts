/**
 * Feed Banner destination contract (PHASE 2).
 * Uses existing FeedAdDestinationType only — no new enum/schema.
 *
 * NONE = internal_page + empty id/url → member render uses # + preventDefault.
 */

import type { FeedAdDestinationType } from "@/lib/ads/feed-ad-placement";

export type FeedAdDestinationInput = {
  destinationType: FeedAdDestinationType | "none" | string;
  destinationId?: string;
  destinationUrl?: string;
};

export type FeedAdDestinationNormalized = {
  destinationType: FeedAdDestinationType;
  destinationId: string;
  destinationUrl: string;
};

export type FeedAdDestinationValidation =
  | { ok: true; value: FeedAdDestinationNormalized }
  | { ok: false; error: string };

const BLOCKED_SCHEMES = /^(javascript|data|file|vbscript):/i;

/** Member "광고 보기" — existing web routes only. */
export function feedAdMemberViewHref(input: {
  placement: string;
  targetCategoryId?: string | null;
  targetTopicSlug?: string | null;
}): string {
  const p = String(input.placement ?? "");
  if (p === "TRADE_HOME") return "/market";
  if (p === "TRADE_CATEGORY") {
    const id = (input.targetCategoryId ?? "").trim();
    return id ? `/market?category=${encodeURIComponent(id)}` : "/market";
  }
  if (p === "COMMUNITY_HOME") return "/philife";
  if (p === "COMMUNITY_TOPIC") {
    const slug = (input.targetTopicSlug ?? "").trim().toLowerCase();
    return slug ? `/philife?category=${encodeURIComponent(slug)}` : "/philife";
  }
  return "/market";
}

export function normalizeFeedAdDestination(
  input: FeedAdDestinationInput
): FeedAdDestinationValidation {
  const rawType = String(input.destinationType ?? "").trim().toLowerCase();
  const id = String(input.destinationId ?? "").trim();
  const url = String(input.destinationUrl ?? "").trim();

  // NONE — no navigation
  if (rawType === "none" || (rawType === "" && !id && !url)) {
    return {
      ok: true,
      value: {
        destinationType: "internal_page",
        destinationId: "",
        destinationUrl: "",
      },
    };
  }

  if (rawType === "external_url" || /^https?:\/\//i.test(url)) {
    if (!url) {
      return { ok: false, error: "external_url_required" };
    }
    if (BLOCKED_SCHEMES.test(url)) {
      return { ok: false, error: "invalid_url_scheme" };
    }
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return { ok: false, error: "invalid_url" };
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return { ok: false, error: "invalid_url_scheme" };
    }
    // Prefer https; allow http only if already http (existing contract soft)
    return {
      ok: true,
      value: {
        destinationType: "external_url",
        destinationId: "",
        destinationUrl: parsed.toString(),
      },
    };
  }

  if (rawType === "trade_listing") {
    if (!id) return { ok: false, error: "destination_id_required" };
    return {
      ok: true,
      value: { destinationType: "trade_listing", destinationId: id, destinationUrl: "" },
    };
  }
  if (rawType === "community_post") {
    if (!id) return { ok: false, error: "destination_id_required" };
    return {
      ok: true,
      value: { destinationType: "community_post", destinationId: id, destinationUrl: "" },
    };
  }
  if (rawType === "store") {
    if (!id) return { ok: false, error: "destination_id_required" };
    return {
      ok: true,
      value: { destinationType: "store", destinationId: id, destinationUrl: "" },
    };
  }

  // internal_page — must be app-relative path
  if (rawType === "internal_page" || url.startsWith("/")) {
    const path = url || "/";
    if (!path.startsWith("/")) {
      return { ok: false, error: "internal_path_required" };
    }
    if (BLOCKED_SCHEMES.test(path)) {
      return { ok: false, error: "invalid_url_scheme" };
    }
    return {
      ok: true,
      value: {
        destinationType: "internal_page",
        destinationId: id,
        destinationUrl: path,
      },
    };
  }

  return { ok: false, error: "invalid_destination_type" };
}

/** True when creative should not navigate (NONE contract). */
export function isFeedAdDestinationNone(
  c: Pick<FeedAdDestinationNormalized, "destinationType" | "destinationId" | "destinationUrl">
): boolean {
  return (
    c.destinationType === "internal_page" &&
    !c.destinationId.trim() &&
    !c.destinationUrl.trim()
  );
}
