/**
 * EVT-03 — a promotion popup whose CTA lands on a platform event is shown only while that
 * event exists, is public (published) and is running (started, not ended).
 *
 * Self-contained on purpose: reads `platform_events` directly (id/status/window only) so the
 * popup resolver does not depend on Event CMS loaders. Fail-closed: query error → unavailable.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normalizePlatformPopupCta,
  platformPopupCtaEventId,
  type PlatformPopupCtaInput,
  type PlatformPopupCtaTargetLookup,
} from "@/lib/platform-popup/cta";

export type PopupEventAvailabilityRow = {
  id: string;
  status: string | null;
  starts_at: string | null;
  ends_at: string | null;
};

/**
 * Lookup for CTA kinds this loader does not entity-check (trade listing / community post /
 * store). Kept explicit so the gate is visible; the event kind never uses it.
 */
export const POPUP_CTA_LOOKUP_NOT_ENTITY_CHECKED: PlatformPopupCtaTargetLookup = {
  exists: true,
  visible: true,
  authorized: true,
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Pure: event row → CTA lookup. Only `published` counts as public (draft / unpublished / archived do not). */
export function popupEventLookupFromRow(
  row: PopupEventAvailabilityRow | null | undefined,
  nowMs: number
): PlatformPopupCtaTargetLookup {
  if (!row) return { exists: false, visible: false };
  const status = String(row.status ?? "").trim().toLowerCase();
  const startMs = row.starts_at ? Date.parse(row.starts_at) : NaN;
  const endMs = row.ends_at ? Date.parse(row.ends_at) : NaN;
  const notStarted = Number.isFinite(startMs) && startMs > nowMs;
  const ended = Number.isFinite(endMs) && endMs < nowMs;
  return {
    exists: true,
    visible: status === "published" && !notStarted,
    expired: ended,
    authorized: true,
  };
}

/** Event id a raw popup CTA lands on (event_detail or internal `/events/:id`). */
export function popupCtaInputEventId(input: PlatformPopupCtaInput): string | null {
  const normalized = normalizePlatformPopupCta(input);
  return normalized.ok ? platformPopupCtaEventId(normalized.value) : null;
}

/** Batch read — one query for all event-destination candidates. */
export async function loadPopupEventDestinationLookups(
  sb: SupabaseClient,
  eventIds: readonly string[],
  nowMs: number = Date.now()
): Promise<Map<string, PlatformPopupCtaTargetLookup>> {
  const out = new Map<string, PlatformPopupCtaTargetLookup>();
  const unique = [...new Set(eventIds.map((id) => id.trim()).filter(Boolean))];
  if (!unique.length) return out;

  const queryable = unique.filter((id) => UUID_RE.test(id));
  const rowsById = new Map<string, PopupEventAvailabilityRow>();
  let failed = false;
  if (queryable.length) {
    const { data, error } = await sb
      .from("platform_events")
      .select("id, status, starts_at, ends_at")
      .in("id", queryable);
    if (error) failed = true;
    for (const row of (data ?? []) as PopupEventAvailabilityRow[]) {
      rowsById.set(String(row.id).toLowerCase(), row);
    }
  }

  for (const id of unique) {
    if (failed) {
      out.set(id, { exists: false, visible: false });
      continue;
    }
    out.set(id, popupEventLookupFromRow(rowsById.get(id.toLowerCase()) ?? null, nowMs));
  }
  return out;
}

/** Candidate CTA → lookup used by `validatePlatformPopupCta` in the resolver. */
export function resolvePopupCandidateCtaLookup(
  input: PlatformPopupCtaInput,
  eventLookups: ReadonlyMap<string, PlatformPopupCtaTargetLookup>
): PlatformPopupCtaTargetLookup {
  const eventId = popupCtaInputEventId(input);
  if (eventId) return eventLookups.get(eventId) ?? { exists: false, visible: false };
  return POPUP_CTA_LOOKUP_NOT_ENTITY_CHECKED;
}
