/**
 * Platform Popup CUT 1 — CTA / landing validation (fail-closed).
 * Prefer internal DIBAY destinations; external only when explicitly typed.
 *
 * Scope B (WP5): the storage vocabulary (cta_type / cta_target / external_url) is kept for
 * existing writers, but every path / URL is validated by the shared DestinationRef contract
 * (`lib/destination/destination-contract.ts`). `event_detail` ↔ `{ kind: "event" }`.
 */

import {
  destinationHref,
  parseDestinationHref,
  type DestinationError,
  type DestinationRef,
} from "@/lib/destination/destination-contract";
import type { PlatformPopupCtaType } from "@/lib/platform-popup/types";

const BLOCKED_SCHEMES = /^(javascript|data|file|vbscript):/i;

/** Popup-only extra guard: messenger deep escapes are not a promotion landing. */
const POPUP_FORBIDDEN_INTERNAL_PREFIXES = ["/community-messenger"];

function mapExternalDestinationError(error: DestinationError, raw: string): string {
  if (error === "destination_empty") return "external_url_required";
  if (BLOCKED_SCHEMES.test(raw)) return "invalid_url_scheme";
  // Legacy codes: http → https_required; other parsable schemes (ftp:, mailto:) → scheme error.
  if (error === "https_required") return /^http:/i.test(raw) ? "https_required" : "invalid_url_scheme";
  return "invalid_url";
}

function mapInternalDestinationError(error: DestinationError, raw: string): string {
  if (error === "internal_path_forbidden") return "internal_path_forbidden";
  if (BLOCKED_SCHEMES.test(raw)) return "invalid_url_scheme";
  return "internal_path_required";
}

export type PlatformPopupCtaInput = {
  ctaType: PlatformPopupCtaType | string;
  ctaTarget?: string | null;
  externalUrl?: string | null;
};

export type PlatformPopupCtaNormalized = {
  ctaType: PlatformPopupCtaType;
  ctaTarget: string;
  externalUrl: string | null;
  href: string;
};

export type PlatformPopupCtaValidation =
  | { ok: true; value: PlatformPopupCtaNormalized }
  | { ok: false; error: string };

export type PlatformPopupCtaTargetLookup = {
  exists: boolean;
  visible: boolean;
  expired?: boolean;
  authorized?: boolean;
};

/**
 * Structural normalize + scheme/path checks.
 * Entity existence is validated via `assertPlatformPopupCtaTargetAvailable`.
 */
export function normalizePlatformPopupCta(input: PlatformPopupCtaInput): PlatformPopupCtaValidation {
  const rawType = String(input.ctaType ?? "").trim().toLowerCase();
  const target = String(input.ctaTarget ?? "").trim();
  const url = String(input.externalUrl ?? "").trim();

  if (rawType === "external_url") {
    const parsed = parseDestinationHref(url);
    if (!parsed.ok) return { ok: false, error: mapExternalDestinationError(parsed.error, url) };
    if (parsed.ref.kind !== "external_url") return { ok: false, error: "invalid_url_scheme" };
    return {
      ok: true,
      value: {
        ctaType: "external_url",
        ctaTarget: "",
        externalUrl: parsed.ref.url,
        href: parsed.ref.url,
      },
    };
  }

  if (rawType === "trade_listing") {
    if (!target) return { ok: false, error: "destination_id_required" };
    return {
      ok: true,
      value: {
        ctaType: "trade_listing",
        ctaTarget: target,
        externalUrl: null,
        href: `/post/${encodeURIComponent(target)}`,
      },
    };
  }

  if (rawType === "community_post") {
    if (!target) return { ok: false, error: "destination_id_required" };
    return {
      ok: true,
      value: {
        ctaType: "community_post",
        ctaTarget: target,
        externalUrl: null,
        href: `/philife/post/${encodeURIComponent(target)}`,
      },
    };
  }

  if (rawType === "store") {
    if (!target) return { ok: false, error: "destination_id_required" };
    return {
      ok: true,
      value: {
        ctaType: "store",
        ctaTarget: target,
        externalUrl: null,
        href: `/stores/${encodeURIComponent(target)}`,
      },
    };
  }

  if (rawType === "event_detail") {
    if (!target) return { ok: false, error: "destination_id_required" };
    // Canonical path via DestinationRef — do not hardcode alternate event routes.
    return {
      ok: true,
      value: {
        ctaType: "event_detail",
        ctaTarget: target,
        externalUrl: null,
        href: destinationHref({ kind: "event", eventId: target }),
      },
    };
  }

  if (rawType === "internal_page") {
    const path = target || url;
    if (!path.startsWith("/")) {
      return { ok: false, error: BLOCKED_SCHEMES.test(path) ? "invalid_url_scheme" : "internal_path_required" };
    }
    const parsed = parseDestinationHref(path);
    if (!parsed.ok) return { ok: false, error: mapInternalDestinationError(parsed.error, path) };
    if (parsed.ref.kind === "external_url") return { ok: false, error: "internal_path_required" };
    // Fail closed: do not allow admin/owner/messenger deep escapes as popup landing SSOT.
    const lower = path.toLowerCase();
    if (POPUP_FORBIDDEN_INTERNAL_PREFIXES.some((p) => lower === p || lower.startsWith(`${p}/`) || lower.startsWith(`${p}?`))) {
      return { ok: false, error: "internal_path_forbidden" };
    }
    return {
      ok: true,
      value: {
        ctaType: "internal_page",
        ctaTarget: path,
        externalUrl: null,
        href: path,
      },
    };
  }

  return { ok: false, error: "invalid_cta_type" };
}

/**
 * Normalized CTA → shared DestinationRef.
 * `event_detail` and `internal_page` pointing at `/events/:id` both become `{ kind: "event" }`.
 */
export function platformPopupCtaToDestinationRef(
  normalized: Pick<PlatformPopupCtaNormalized, "ctaType" | "ctaTarget" | "externalUrl" | "href">
): DestinationRef | null {
  if (normalized.ctaType === "event_detail") {
    const id = normalized.ctaTarget.trim();
    return id ? { kind: "event", eventId: id } : null;
  }
  if (normalized.ctaType === "external_url") {
    const parsed = parseDestinationHref(normalized.externalUrl ?? normalized.href);
    return parsed.ok && parsed.ref.kind === "external_url" ? parsed.ref : null;
  }
  const parsed = parseDestinationHref(normalized.href);
  return parsed.ok ? parsed.ref : null;
}

/** Validate a raw popup CTA input and return its DestinationRef (structure only). */
export function resolvePlatformPopupCtaDestinationRef(input: PlatformPopupCtaInput): DestinationRef | null {
  const normalized = normalizePlatformPopupCta(input);
  return normalized.ok ? platformPopupCtaToDestinationRef(normalized.value) : null;
}

/**
 * DestinationRef → popup storage triple (writers keep the existing columns).
 * `event` → `event_detail`, `external_url` → `external_url`, `internal_route` → `internal_page`.
 */
export function destinationRefToPlatformPopupCtaInput(ref: DestinationRef): {
  ctaType: PlatformPopupCtaType;
  ctaTarget: string;
  externalUrl: string | null;
} {
  if (ref.kind === "event") return { ctaType: "event_detail", ctaTarget: ref.eventId, externalUrl: null };
  if (ref.kind === "external_url") return { ctaType: "external_url", ctaTarget: "", externalUrl: ref.url };
  return { ctaType: "internal_page", ctaTarget: ref.path, externalUrl: null };
}

/** Event id the CTA lands on (event_detail or internal `/events/:id`), else null. */
export function platformPopupCtaEventId(
  normalized: Pick<PlatformPopupCtaNormalized, "ctaType" | "ctaTarget" | "externalUrl" | "href">
): string | null {
  const ref = platformPopupCtaToDestinationRef(normalized);
  return ref?.kind === "event" ? ref.eventId : null;
}

/** Fail-closed entity gate — invalid/deleted/hidden/expired/unauthorized. */
export function assertPlatformPopupCtaTargetAvailable(
  normalized: PlatformPopupCtaNormalized,
  lookup: PlatformPopupCtaTargetLookup | null | undefined
): PlatformPopupCtaValidation {
  if (normalized.ctaType === "external_url") {
    return { ok: true, value: normalized };
  }
  if (normalized.ctaType === "internal_page" && !platformPopupCtaEventId(normalized)) {
    // Path-only; no entity lookup required beyond structural normalize.
    // (An internal path to `/events/:id` is an event destination → entity gate below.)
    return { ok: true, value: normalized };
  }
  if (!lookup) return { ok: false, error: "target_unavailable" };
  if (!lookup.exists) return { ok: false, error: "target_deleted" };
  if (!lookup.visible) return { ok: false, error: "target_hidden" };
  if (lookup.expired) return { ok: false, error: "target_expired" };
  if (lookup.authorized === false) return { ok: false, error: "target_unauthorized" };
  return { ok: true, value: normalized };
}

export function validatePlatformPopupCta(
  input: PlatformPopupCtaInput,
  lookup?: PlatformPopupCtaTargetLookup | null
): PlatformPopupCtaValidation {
  const normalized = normalizePlatformPopupCta(input);
  if (!normalized.ok) return normalized;
  // Entity gate only when caller supplies lookup (incl. explicit null).
  // Owner/Admin writers validate structure here; runtime/resolve pass lookup.
  if (arguments.length < 2) {
    return { ok: true, value: normalized.value };
  }
  return assertPlatformPopupCtaTargetAvailable(normalized.value, lookup);
}
