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
    .select("id, title, updated_at")
    .order("updated_at", { ascending: false });
  if (error) return { ok: false, error: error.message };
  const items = ((data ?? []) as ShowRow[]).map((row) => ({
    id: row.id,
    title: row.title,
    updatedAt: row.updated_at,
  }));
  return { ok: true, items };
}

export async function loadOpeningShowDetail(
  sb: SupabaseClient,
  showId: string
): Promise<{ ok: true; detail: OpeningShowDetail } | { ok: false; error: string; httpStatus: number }> {
  const { data: show, error: showError } = await sb
    .from("opening_shows")
    .select("id, title, updated_at")
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
  return {
    ok: true,
    detail: {
      id: showRow.id,
      title: showRow.title,
      document,
      media: mapMedia(sb, (mediaRows ?? []) as MediaRow[], derivatives),
      updatedAt: draftRow?.updated_at ?? showRow.updated_at,
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
