/**
 * Feed Banner destination contract (PHASE 2).
 * Uses existing FeedAdDestinationType only — no new enum/schema.
 *
 * NONE = internal_page + empty id/url → member render uses # + preventDefault.
 *
 * Scope B (EVT-05): URLs / paths go through the shared DestinationRef contract
 * (`parseDestinationHref`) — https only, same-origin internal paths, no admin/owner deep links.
 * Event destinations are stored as `internal_page` + `/events/:id` (DB enum unchanged);
 * input `destinationType: "event"` + `destinationId` is accepted and mapped to that.
 */

import type { FeedAdDestinationType } from "@/lib/ads/feed-ad-placement";
import {
  eventDestinationPath,
  parseDestinationHref,
  type DestinationRef,
} from "@/lib/destination/destination-contract";

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

  if (rawType === "external_url" || /^[a-z][a-z0-9+.-]*:/i.test(url)) {
    if (!url) {
      return { ok: false, error: "external_url_required" };
    }
    if (BLOCKED_SCHEMES.test(url)) {
      return { ok: false, error: "invalid_url_scheme" };
    }
    const parsed = parseDestinationHref(url);
    if (!parsed.ok) {
      if (parsed.error === "https_required") return { ok: false, error: "https_required" };
      return { ok: false, error: "invalid_url" };
    }
    if (parsed.ref.kind !== "external_url") return { ok: false, error: "invalid_url" };
    return {
      ok: true,
      value: {
        destinationType: "external_url",
        destinationId: "",
        destinationUrl: parsed.ref.url,
      },
    };
  }

  if (rawType === "event" || rawType === "event_detail") {
    if (!id) return { ok: false, error: "destination_id_required" };
    return {
      ok: true,
      value: {
        destinationType: "internal_page",
        destinationId: "",
        destinationUrl: eventDestinationPath(id),
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

  // internal_page — must be app-relative path (or `/events/:id` event destination)
  if (rawType === "internal_page" || url.startsWith("/")) {
    const path = url || "/";
    if (!path.startsWith("/")) {
      return { ok: false, error: "internal_path_required" };
    }
    const parsed = parseDestinationHref(path);
    if (!parsed.ok) {
      return {
        ok: false,
        error: parsed.error === "internal_path_forbidden" ? "internal_path_forbidden" : "internal_path_required",
      };
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

/**
 * Stored feed-ad destination → shared DestinationRef (null = NONE / invalid → no navigation).
 * Legacy rows are re-validated here, so a stored http:// or unsafe value never opens.
 */
export function feedAdDestinationRef(input: {
  destinationType?: FeedAdDestinationType | string | null;
  destinationId?: string | null;
  destinationUrl?: string | null;
}): DestinationRef | null {
  const type = String(input.destinationType ?? "").trim();
  const id = String(input.destinationId ?? "").trim();
  const url = String(input.destinationUrl ?? "").trim();
  let href = "";
  if (type === "trade_listing" && id) href = `/post/${encodeURIComponent(id)}`;
  else if (type === "community_post" && id) href = `/philife/post/${encodeURIComponent(id)}`;
  else if (type === "store" && id) href = `/stores/${encodeURIComponent(id)}`;
  else href = url;
  if (!href) return null;
  const parsed = parseDestinationHref(href);
  return parsed.ok ? parsed.ref : null;
}
