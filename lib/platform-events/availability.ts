/**
 * Destination check for other surfaces (promotion popup, ads, banners) before they show a CTA
 * that points at `/events/:id`.
 *
 * - exists:  row found
 * - visible: published and not archived (draft / unpublished / archived → false)
 * - started: starts_at is null or in the past
 * - ended:   ends_at is in the past
 *
 * A destination is safe to promote when `exists && visible && started && !ended`.
 * Ended events stay viewable on Event Detail (EVT-02) but should not be promoted.
 */
import { loadPlatformEventByIdAdmin } from "@/lib/platform-events/load-event";
import type { PlatformEventRow } from "@/lib/platform-events/types";

export type PlatformEventAvailabilityFlags = {
  exists: boolean;
  visible: boolean;
  ended: boolean;
  started: boolean;
};

const MISSING: PlatformEventAvailabilityFlags = {
  exists: false,
  visible: false,
  ended: false,
  started: false,
};

export function computePlatformEventAvailabilityFlags(
  row: Pick<PlatformEventRow, "status" | "startsAt" | "endsAt" | "archivedAt"> | null | undefined,
  nowMs: number = Date.now()
): PlatformEventAvailabilityFlags {
  if (!row) return { ...MISSING };
  const start = row.startsAt ? Date.parse(row.startsAt) : NaN;
  const end = row.endsAt ? Date.parse(row.endsAt) : NaN;
  return {
    exists: true,
    visible: String(row.status ?? "").trim().toLowerCase() === "published" && !row.archivedAt,
    started: !Number.isFinite(start) || start <= nowMs,
    ended: Number.isFinite(end) && end < nowMs,
  };
}

export function isPlatformEventPromotable(flags: PlatformEventAvailabilityFlags): boolean {
  return flags.exists && flags.visible && flags.started && !flags.ended;
}

/** Server-only (service role read). */
export async function getPlatformEventAvailability(
  eventId: string,
  nowMs: number = Date.now()
): Promise<PlatformEventAvailabilityFlags> {
  const row = await loadPlatformEventByIdAdmin(eventId);
  return computePlatformEventAvailabilityFlags(row, nowMs);
}
