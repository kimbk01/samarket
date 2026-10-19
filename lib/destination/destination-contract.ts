/**
 * Scope B — single link / CTA contract (DestinationRef).
 *
 * One vocabulary for admin input, preview, server payload, app router and every CTA surface
 * (notification campaign, promotion popup / modal, banners, feed ads, event board).
 * Pure module: safe on server and client.
 *
 * - internal_route: same-origin app path only (no "//host", backslash, control chars).
 *   Member-facing surfaces may not deep-link into /admin or /stores/owner.
 * - external_url:   https only. Opened outside the app WebView (in-app browser).
 * - event:          platform event → canonical /events/:id.
 */
import { resolveSameOriginPushRoutePath } from "@/lib/push/push-route-policy";

export type DestinationRef =
  | { kind: "internal_route"; path: string }
  | { kind: "external_url"; url: string }
  | { kind: "event"; eventId: string };

export type DestinationError =
  | "destination_empty"
  | "invalid_internal_path"
  | "internal_path_forbidden"
  | "invalid_url"
  | "https_required"
  | "event_id_required";

export type DestinationParseResult = { ok: true; ref: DestinationRef } | { ok: false; error: DestinationError };

const BLOCKED_SCHEMES = /^(javascript|data|file|vbscript):/i;
const MEMBER_FORBIDDEN_PREFIXES = ["/admin", "/stores/owner"];
const EVENT_PATH = /^\/events\/([^/?#]+)\/?(?:[?#].*)?$/;

export function eventDestinationPath(eventId: string): string {
  return `/events/${encodeURIComponent(eventId)}`;
}

function checkInternalPath(raw: string, opts?: { allowAdmin?: boolean }): DestinationParseResult {
  const path = resolveSameOriginPushRoutePath(raw);
  if (!path || BLOCKED_SCHEMES.test(raw.trim())) return { ok: false, error: "invalid_internal_path" };
  if (!opts?.allowAdmin) {
    const lower = path.toLowerCase();
    if (MEMBER_FORBIDDEN_PREFIXES.some((p) => lower === p || lower.startsWith(`${p}/`) || lower.startsWith(`${p}?`))) {
      return { ok: false, error: "internal_path_forbidden" };
    }
  }
  const ev = EVENT_PATH.exec(path);
  if (ev) {
    try {
      return { ok: true, ref: { kind: "event", eventId: decodeURIComponent(ev[1]) } };
    } catch {
      return { ok: false, error: "invalid_internal_path" };
    }
  }
  return { ok: true, ref: { kind: "internal_route", path } };
}

function checkExternalUrl(raw: string): DestinationParseResult {
  if (BLOCKED_SCHEMES.test(raw)) return { ok: false, error: "invalid_url" };
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, error: "invalid_url" };
  }
  if (parsed.protocol !== "https:") return { ok: false, error: "https_required" };
  return { ok: true, ref: { kind: "external_url", url: parsed.toString() } };
}

/**
 * Parse a free-form link (admin input, legacy stored href) into a DestinationRef.
 * "/..." → internal (or event); "https://..." → external. Everything else is rejected.
 */
export function parseDestinationHref(
  raw: unknown,
  opts?: { allowAdmin?: boolean }
): DestinationParseResult {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return { ok: false, error: "destination_empty" };
  if (s.startsWith("/")) return checkInternalPath(s, opts);
  return checkExternalUrl(s);
}

/** Validate a structured ref (already typed by the writer). */
export function validateDestinationRef(ref: unknown, opts?: { allowAdmin?: boolean }): DestinationParseResult {
  if (!ref || typeof ref !== "object") return { ok: false, error: "destination_empty" };
  const r = ref as Record<string, unknown>;
  if (r.kind === "event") {
    const id = typeof r.eventId === "string" ? r.eventId.trim() : "";
    return id ? { ok: true, ref: { kind: "event", eventId: id } } : { ok: false, error: "event_id_required" };
  }
  if (r.kind === "internal_route") return checkInternalPath(String(r.path ?? ""), opts);
  if (r.kind === "external_url") return checkExternalUrl(String(r.url ?? "").trim());
  return { ok: false, error: "destination_empty" };
}

/** The href a router / anchor uses for this destination. */
export function destinationHref(ref: DestinationRef): string {
  if (ref.kind === "event") return eventDestinationPath(ref.eventId);
  if (ref.kind === "external_url") return ref.url;
  return ref.path;
}

export function isExternalDestination(ref: DestinationRef): ref is { kind: "external_url"; url: string } {
  return ref.kind === "external_url";
}
