import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { mapPlatformEventDbRow, type PlatformEventDbRow } from "@/lib/platform-events/map-row";
import { isPlatformEventPubliclyAvailable } from "@/lib/platform-events/publication";
import { PLATFORM_EVENTS_SELECT, type PlatformEventRow } from "@/lib/platform-events/types";

export async function loadPlatformEventByIdAdmin(
  eventId: string
): Promise<PlatformEventRow | null> {
  const id = String(eventId ?? "").trim();
  if (!id) return null;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return null;
  const { data, error } = await sb
    .from("platform_events")
    .select(PLATFORM_EVENTS_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return mapPlatformEventDbRow(data as PlatformEventDbRow);
}

export async function listPlatformEventsAdmin(limit = 100): Promise<PlatformEventRow[]> {
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return [];
  const { data, error } = await sb
    .from("platform_events")
    .select(PLATFORM_EVENTS_SELECT)
    .order("updated_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200));
  if (error || !data) return [];
  return (data as PlatformEventDbRow[]).map(mapPlatformEventDbRow);
}

/**
 * Public/member load — service read + publication gate (never leak draft).
 * RLS remains for direct client reads; API uses this evaluator as SSOT.
 */
export async function loadPlatformEventByIdPublic(
  eventId: string
): Promise<PlatformEventRow | null> {
  const row = await loadPlatformEventByIdAdmin(eventId);
  if (!row) return null;
  if (!isPlatformEventPubliclyAvailable(row)) return null;
  return row;
}
