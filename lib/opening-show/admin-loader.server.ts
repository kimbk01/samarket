import type { SupabaseClient } from "@supabase/supabase-js";
import { createEmptyOpeningDocument, parseOpeningDocument } from "@/lib/opening-show/document";
import { OPENING_SHOW_BUCKET } from "@/lib/opening-show/storage";
import type {
  OpeningReadyMedia,
  OpeningShowDetail,
  OpeningShowListItem,
} from "@/lib/opening-show/types";

type ShowRow = {
  id: string;
  title: string;
  updated_at: string;
  live_revision_id: string | null;
};

type DraftRow = {
  show_id: string;
  document: unknown;
  updated_at: string;
};

type MediaRow = {
  id: string;
  show_id: string;
  file_name: string;
  mime: string;
  width: number;
  height: number;
};

type DerivativeRow = {
  media_id: string;
  kind: string;
  storage_path: string;
};

type RevisionNumberRow = {
  show_id: string;
  revision_number: number;
  id: string;
};

function publicUrl(sb: SupabaseClient, path: string): string {
  return sb.storage.from(OPENING_SHOW_BUCKET).getPublicUrl(path).data.publicUrl;
}

function mapMedia(
  sb: SupabaseClient,
  rows: MediaRow[],
  derivatives: DerivativeRow[]
): OpeningReadyMedia[] {
  const byMedia = new Map<string, DerivativeRow[]>();
  for (const row of derivatives) {
    const list = byMedia.get(row.media_id) ?? [];
    list.push(row);
    byMedia.set(row.media_id, list);
  }
  return rows.map((row) => {
    const parts = byMedia.get(row.id) ?? [];
    const display = parts.find((part) => part.kind === "display");
    const thumb = parts.find((part) => part.kind === "thumb");
    const displayUrl = display ? publicUrl(sb, display.storage_path) : "";
    const thumbUrl = thumb ? publicUrl(sb, thumb.storage_path) : displayUrl;
    return {
      id: row.id,
      showId: row.show_id,
      fileName: row.file_name,
      mime: row.mime,
      width: row.width,
      height: row.height,
      displayUrl,
      thumbUrl,
    };
  });
}

export async function listOpeningShows(
  sb: SupabaseClient
): Promise<{ ok: true; items: OpeningShowListItem[] } | { ok: false; error: string }> {
  const { data, error } = await sb
    .from("opening_shows")
    .select("id, title, updated_at, live_revision_id")
    .order("updated_at", { ascending: false });
  if (error) return { ok: false, error: error.message };
  const shows = (data ?? []) as ShowRow[];
  const showIds = shows.map((row) => row.id);
  const latestByShow = new Map<string, number>();
  const liveNumberById = new Map<string, number>();
  if (showIds.length > 0) {
    const { data: revRows, error: revError } = await sb
      .from("opening_revisions")
      .select("show_id, revision_number, id")
      .in("show_id", showIds);
    if (revError) return { ok: false, error: revError.message };
    for (const row of (revRows ?? []) as RevisionNumberRow[]) {
      const prev = latestByShow.get(row.show_id) ?? 0;
      if (row.revision_number > prev) latestByShow.set(row.show_id, row.revision_number);
      liveNumberById.set(row.id, row.revision_number);
    }
  }
  const items = shows.map((row) => {
    const liveRevisionNumber = row.live_revision_id
      ? liveNumberById.get(row.live_revision_id) ?? null
      : null;
    return {
      id: row.id,
      title: row.title,
      updatedAt: row.updated_at,
      latestRevisionNumber: latestByShow.get(row.id) ?? null,
      liveRevisionNumber,
      isLive: Boolean(row.live_revision_id),
    };
  });
  return { ok: true, items };
}

export async function loadOpeningShowDetail(
  sb: SupabaseClient,
  showId: string
): Promise<{ ok: true; detail: OpeningShowDetail } | { ok: false; error: string; httpStatus: number }> {
  const { data: show, error: showError } = await sb
    .from("opening_shows")
    .select("id, title, updated_at, live_revision_id")
    .eq("id", showId)
    .maybeSingle();
  if (showError) return { ok: false, error: showError.message, httpStatus: 500 };
  if (!show) return { ok: false, error: "not_found", httpStatus: 404 };

  const { data: draft, error: draftError } = await sb
    .from("opening_drafts")
    .select("show_id, document, updated_at")
    .eq("show_id", showId)
    .maybeSingle();
  if (draftError) return { ok: false, error: draftError.message, httpStatus: 500 };

  const document =
    parseOpeningDocument((draft as DraftRow | null)?.document) ?? createEmptyOpeningDocument();

  const { data: mediaRows, error: mediaError } = await sb
    .from("opening_media")
    .select("id, show_id, file_name, mime, width, height")
    .eq("show_id", showId)
    .order("created_at", { ascending: false });
  if (mediaError) return { ok: false, error: mediaError.message, httpStatus: 500 };

  const ids = ((mediaRows ?? []) as MediaRow[]).map((row) => row.id);
  let derivatives: DerivativeRow[] = [];
  if (ids.length > 0) {
    const { data: derRows, error: derError } = await sb
      .from("opening_media_derivatives")
      .select("media_id, kind, storage_path")
      .in("media_id", ids);
    if (derError) return { ok: false, error: derError.message, httpStatus: 500 };
    derivatives = (derRows ?? []) as DerivativeRow[];
  }

  const showRow = show as ShowRow;
  const draftRow = draft as DraftRow | null;
  const { data: revRows, error: revError } = await sb
    .from("opening_revisions")
    .select("id, revision_number")
    .eq("show_id", showId)
    .order("revision_number", { ascending: false });
  if (revError) return { ok: false, error: revError.message, httpStatus: 500 };
  const revisions = (revRows ?? []) as { id: string; revision_number: number }[];
  const latestRevisionNumber = revisions[0]?.revision_number ?? null;
  const latestRevisionId = revisions[0]?.id ?? null;
  const liveRevisionNumber = showRow.live_revision_id
    ? revisions.find((row) => row.id === showRow.live_revision_id)?.revision_number ?? null
    : null;

  return {
    ok: true,
    detail: {
      id: showRow.id,
      title: showRow.title,
      document,
      media: mapMedia(sb, (mediaRows ?? []) as MediaRow[], derivatives),
      updatedAt: draftRow?.updated_at ?? showRow.updated_at,
      latestRevisionId,
      latestRevisionNumber,
      liveRevisionId: showRow.live_revision_id,
      liveRevisionNumber,
      isLive: Boolean(showRow.live_revision_id),
    },
  };
}

export async function loadReadyOpeningMedia(
  sb: SupabaseClient,
  showId: string
): Promise<{ ok: true; media: OpeningReadyMedia[] } | { ok: false; error: string }> {
  const loaded = await loadOpeningShowDetail(sb, showId);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  return { ok: true, media: loaded.detail.media };
}
