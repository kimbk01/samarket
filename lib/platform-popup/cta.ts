/**
 * Platform Popup CUT 1 — CTA / landing validation (fail-closed).
 * Prefer internal DIBAY destinations; external only when explicitly typed.
 */

import type { PlatformPopupCtaType } from "@/lib/platform-popup/types";

const BLOCKED_SCHEMES = /^(javascript|data|file|vbscript):/i;

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
    if (!url) return { ok: false, error: "external_url_required" };
    if (BLOCKED_SCHEMES.test(url)) return { ok: false, error: "invalid_url_scheme" };
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return { ok: false, error: "invalid_url" };
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return { ok: false, error: "invalid_url_scheme" };
    }
    if (parsed.protocol !== "https:") {
      return { ok: false, error: "https_required" };
    }
    return {
      ok: true,
      value: {
        ctaType: "external_url",
        ctaTarget: "",
        externalUrl: parsed.toString(),
        href: parsed.toString(),
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

  if (rawType === "internal_page") {
    const path = target || url;
    if (!path.startsWith("/")) return { ok: false, error: "internal_path_required" };
    if (path.startsWith("//")) return { ok: false, error: "internal_path_required" };
    if (BLOCKED_SCHEMES.test(path)) return { ok: false, error: "invalid_url_scheme" };
    // Fail closed: do not allow admin/owner/messenger deep escapes as popup landing SSOT.
    const lower = path.toLowerCase();
    if (
      lower.startsWith("/admin") ||
      lower.startsWith("/stores/owner") ||
      lower.startsWith("/community-messenger")
    ) {
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

/** Fail-closed entity gate — invalid/deleted/hidden/expired/unauthorized. */
export function assertPlatformPopupCtaTargetAvailable(
  normalized: PlatformPopupCtaNormalized,
  lookup: PlatformPopupCtaTargetLookup | null | undefined
): PlatformPopupCtaValidation {
  if (normalized.ctaType === "external_url") {
    return { ok: true, value: normalized };
  }
  if (normalized.ctaType === "internal_page") {
    // Path-only; no entity lookup required beyond structural normalize.
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
