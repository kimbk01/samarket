/**
 * Scope B (EVT-07) — save-time check for optional link fields (banner link_url, cta_href).
 * Empty = "no link". Non-empty must parse with the shared DestinationRef contract and is
 * stored in its canonical href form. Pure: server + client (admin preview).
 */
import {
  destinationHref,
  parseDestinationHref,
  type DestinationError,
  type DestinationRef,
} from "@/lib/destination/destination-contract";

export type OptionalDestinationHrefResult =
  | { ok: true; href: string; ref: DestinationRef | null }
  | { ok: false; error: DestinationError };

export function normalizeOptionalDestinationHref(raw: unknown): OptionalDestinationHrefResult {
  const s = typeof raw === "string" ? raw.trim() : raw == null ? "" : String(raw).trim();
  if (!s) return { ok: true, href: "", ref: null };
  const parsed = parseDestinationHref(s);
  if (!parsed.ok) return parsed;
  return { ok: true, href: destinationHref(parsed.ref), ref: parsed.ref };
}

/** Admin preview label: "kind · href" (or the error code). */
export function describeDestinationForAdmin(raw: unknown): {
  ok: boolean;
  kind: DestinationRef["kind"] | "none" | null;
  href: string;
  error: DestinationError | null;
} {
  const r = normalizeOptionalDestinationHref(raw);
  if (!r.ok) return { ok: false, kind: null, href: "", error: r.error };
  return { ok: true, kind: r.ref ? r.ref.kind : "none", href: r.href, error: null };
}
