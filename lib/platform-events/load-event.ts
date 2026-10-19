import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { mapPlatformEventDbRow, type PlatformEventDbRow } from "@/lib/platform-events/map-row";
import { isPlatformEventPubliclyAvailable } from "@/lib/platform-events/publication";
import { selectPlatformEventsWithBoardFallback } from "@/lib/platform-events/board-columns-fallback";
import {
  PLATFORM_EVENT_BOARD_CANDIDATE_LIMIT,
  platformEventBoardDbWindow,
  type PlatformEventBoardState,
} from "@/lib/platform-events/board";
import {
  PLATFORM_EVENTS_SELECT_WITH_BOARD,
  type PlatformEventRow,
} from "@/lib/platform-events/types";

export async function loadPlatformEventByIdAdmin(
  eventId: string
): Promise<PlatformEventRow | null> {
  const id = String(eventId ?? "").trim();
  if (!id) return null;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return null;
  const { data, error } = await selectPlatformEventsWithBoardFallback((select) =>
    sb.from("platform_events").select(select).eq("id", id).maybeSingle()
  );
  if (error || !data) return null;
  return mapPlatformEventDbRow(data as PlatformEventDbRow);
}

export async function listPlatformEventsAdmin(limit = 100): Promise<PlatformEventRow[]> {
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return [];
  const { data, error } = await selectPlatformEventsWithBoardFallback((select) =>
    sb
      .from("platform_events")
      .select(select)
      .order("updated_at", { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 200))
  );
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

/**
 * Event board candidates — DB pre-filter only (published, not archived, end window).
 * `paginatePlatformEventBoard` re-applies the full state rule (incl. "started"), order and cursor.
 */
export async function listPlatformEventBoardCandidates(
  state: PlatformEventBoardState,
  nowMs: number = Date.now()
): Promise<{ ok: true; rows: PlatformEventRow[] } | { ok: false; error: string }> {
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return { ok: false, error: "supabase_unconfigured" };
  const { nowIso, endedSinceIso } = platformEventBoardDbWindow(nowMs);
  const { data, error } = await selectPlatformEventsWithBoardFallback((select) => {
    let q = sb.from("platform_events").select(select).eq("status", "published");
    if (select === PLATFORM_EVENTS_SELECT_WITH_BOARD) q = q.is("archived_at", null);
    q =
      state === "ongoing"
        ? q.or(`ends_at.is.null,ends_at.gte.${nowIso}`)
        : q.lt("ends_at", nowIso).gte("ends_at", endedSinceIso);
    return q
      .order("starts_at", { ascending: false, nullsFirst: false })
      .limit(PLATFORM_EVENT_BOARD_CANDIDATE_LIMIT);
  });
  if (error) return { ok: false, error: String(error.message ?? "query_failed") };
  return { ok: true, rows: ((data ?? []) as PlatformEventDbRow[]).map(mapPlatformEventDbRow) };
}
