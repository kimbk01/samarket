import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createEmptyOpeningDocument,
  parseOpeningDocument,
  type OpeningDocument,
} from "@/lib/opening-show/document";
import {
  OPENING_SHOW_BUCKET,
  assertOpeningStoragePath,
  openingDerivativePath,
} from "@/lib/opening-show/storage";
import type { OpeningReadyMedia } from "@/lib/opening-show/types";
import type { OpeningImageMime } from "@/lib/opening-show/media-validate";

function publicUrl(sb: SupabaseClient, path: string): string {
  return sb.storage.from(OPENING_SHOW_BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function createOpeningShow(
  sb: SupabaseClient,
  input: { adminUserId: string; title: string }
): Promise<{ ok: true; id: string } | { ok: false; error: string; httpStatus: number }> {
  const title = input.title.trim();
  if (!title) return { ok: false, error: "title_required", httpStatus: 400 };
  if (title.length > 120) return { ok: false, error: "title_too_long", httpStatus: 400 };

  const { data: show, error: showError } = await sb
    .from("opening_shows")
    .insert({
      title,
      created_by: input.adminUserId,
    })
    .select("id")
    .single();
  if (showError || !show?.id) {
    return { ok: false, error: showError?.message || "create_failed", httpStatus: 500 };
  }

  const document = createEmptyOpeningDocument();
  const { error: draftError } = await sb.from("opening_drafts").insert({
    show_id: show.id,
    document,
    updated_by: input.adminUserId,
  });
  if (draftError) {
    await sb.from("opening_shows").delete().eq("id", show.id);
    return { ok: false, error: draftError.message, httpStatus: 500 };
  }
  return { ok: true, id: show.id };
}

export async function saveOpeningDraft(
  sb: SupabaseClient,
  input: { showId: string; adminUserId: string; title: string; document: unknown }
): Promise<{ ok: true; document: OpeningDocument } | { ok: false; error: string; httpStatus: number }> {
  const title = input.title.trim();
  if (!title) return { ok: false, error: "title_required", httpStatus: 400 };
  if (title.length > 120) return { ok: false, error: "title_too_long", httpStatus: 400 };
  const document = parseOpeningDocument(input.document);
  if (!document) return { ok: false, error: "invalid_document", httpStatus: 400 };

  const { data: show, error: showError } = await sb
    .from("opening_shows")
    .select("id")
    .eq("id", input.showId)
    .maybeSingle();
  if (showError) return { ok: false, error: showError.message, httpStatus: 500 };
  if (!show) return { ok: false, error: "not_found", httpStatus: 404 };

  const now = new Date().toISOString();
  const { error: draftError } = await sb.from("opening_drafts").upsert({
    show_id: input.showId,
    document,
    updated_by: input.adminUserId,
    updated_at: now,
  });
  if (draftError) return { ok: false, error: draftError.message, httpStatus: 500 };

  const { error: titleError } = await sb
    .from("opening_shows")
    .update({ title, updated_at: now })
    .eq("id", input.showId);
  if (titleError) return { ok: false, error: titleError.message, httpStatus: 500 };

  return { ok: true, document };
}

export async function insertReadyOpeningMedia(
  sb: SupabaseClient,
  input: {
    showId: string;
    mediaId: string;
    adminUserId: string;
    fileName: string;
    mime: OpeningImageMime;
    byteSize: number;
    width: number;
    height: number;
    sourcePath: string;
    displayPath: string;
    thumbPath: string;
    runtimeDisplayPath: string;
    displayWidth: number;
    displayHeight: number;
    displayBytes: number;
    thumbWidth: number;
    thumbHeight: number;
    thumbBytes: number;
    runtimeWidth: number;
    runtimeHeight: number;
    runtimeBytes: number;
  }
): Promise<{ ok: true; media: OpeningReadyMedia } | { ok: false; error: string; httpStatus: number }> {
  if (!assertOpeningStoragePath(input.sourcePath)) {
    return { ok: false, error: "invalid_storage_path", httpStatus: 400 };
  }
  if (
    !assertOpeningStoragePath(input.displayPath) ||
    !assertOpeningStoragePath(input.thumbPath) ||
    !assertOpeningStoragePath(input.runtimeDisplayPath)
  ) {
    return { ok: false, error: "invalid_storage_path", httpStatus: 400 };
  }

  const { data: existing } = await sb
    .from("opening_media")
    .select("id, show_id, file_name, mime, width, height")
    .eq("id", input.mediaId)
    .maybeSingle();
  if (existing) {
    await sb.from("opening_media_derivatives").upsert(
      {
        media_id: input.mediaId,
        kind: "runtimeDisplay",
        storage_path: input.runtimeDisplayPath,
        mime: "image/webp",
        width: input.runtimeWidth,
        height: input.runtimeHeight,
        byte_size: input.runtimeBytes,
      },
      { onConflict: "media_id,kind" }
    );
    return {
      ok: true,
      media: {
        id: existing.id,
        showId: existing.show_id,
        fileName: existing.file_name,
        mime: existing.mime,
        width: existing.width,
        height: existing.height,
        displayUrl: publicUrl(sb, openingDerivativePath(input.showId, input.mediaId, "display")),
        thumbUrl: publicUrl(sb, openingDerivativePath(input.showId, input.mediaId, "thumb")),
      },
    };
  }

  const { error: mediaError } = await sb.from("opening_media").insert({
    id: input.mediaId,
    show_id: input.showId,
    file_name: input.fileName,
    mime: input.mime,
    byte_size: input.byteSize,
    width: input.width,
    height: input.height,
    source_path: input.sourcePath,
    created_by: input.adminUserId,
  });
  if (mediaError) return { ok: false, error: mediaError.message, httpStatus: 500 };

  const { error: derError } = await sb.from("opening_media_derivatives").insert([
    {
      media_id: input.mediaId,
      kind: "display",
      storage_path: input.displayPath,
      mime: "image/webp",
      width: input.displayWidth,
      height: input.displayHeight,
      byte_size: input.displayBytes,
    },
    {
      media_id: input.mediaId,
      kind: "thumb",
      storage_path: input.thumbPath,
      mime: "image/webp",
      width: input.thumbWidth,
      height: input.thumbHeight,
      byte_size: input.thumbBytes,
    },
    {
      media_id: input.mediaId,
      kind: "runtimeDisplay",
      storage_path: input.runtimeDisplayPath,
      mime: "image/webp",
      width: input.runtimeWidth,
      height: input.runtimeHeight,
      byte_size: input.runtimeBytes,
    },
  ]);
  if (derError) {
    await sb.from("opening_media").delete().eq("id", input.mediaId);
    return { ok: false, error: derError.message, httpStatus: 500 };
  }

  return {
    ok: true,
    media: {
      id: input.mediaId,
      showId: input.showId,
      fileName: input.fileName,
      mime: input.mime,
      width: input.width,
      height: input.height,
      displayUrl: publicUrl(sb, input.displayPath),
      thumbUrl: publicUrl(sb, input.thumbPath),
    },
  };
}
