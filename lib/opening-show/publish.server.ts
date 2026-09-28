import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parseOpeningDocument,
  type OpeningDocument,
  type OpeningScene,
} from "@/lib/opening-show/document";
import { processOpeningImageBuffer } from "@/lib/opening-show/media-process.server";
import {
  OPENING_SHOW_BUCKET,
  assertOpeningStoragePath,
  openingDerivativePath,
} from "@/lib/opening-show/storage";
import {
  openingPublishFailCopy,
  validateOpeningDocumentForPublish,
  type OpeningPublishFailReason,
} from "@/lib/opening-show/publish-validate";
import {
  OPENING_RUNTIME_SCENE_DURATION_MS,
  type OpeningRevisionPayload,
  type OpeningRuntimeAsset,
} from "@/lib/opening-show/runtime-contract";
import { openingManifestChecksum, sha256Hex } from "@/lib/opening-show/sha256";

function publicUrl(sb: SupabaseClient, path: string): string {
  return sb.storage.from(OPENING_SHOW_BUCKET).getPublicUrl(path).data.publicUrl;
}

async function ensureRuntimeDisplay(
  sb: SupabaseClient,
  input: { showId: string; mediaId: string; sourcePath: string; mime: string }
): Promise<{ ok: true; asset: Omit<OpeningRuntimeAsset, "url"> & { path: string } } | { ok: false; reason: OpeningPublishFailReason }> {
  const runtimePath = openingDerivativePath(input.showId, input.mediaId, "runtimeDisplay");
  const { data: existing } = await sb
    .from("opening_media_derivatives")
    .select("storage_path, byte_size")
    .eq("media_id", input.mediaId)
    .eq("kind", "runtimeDisplay")
    .maybeSingle();

  if (existing?.storage_path && assertOpeningStoragePath(existing.storage_path)) {
    const downloaded = await sb.storage.from(OPENING_SHOW_BUCKET).download(existing.storage_path);
    if (downloaded.error || !downloaded.data) {
      return { ok: false, reason: "derivative_not_ready" };
    }
    const bytes = Buffer.from(await downloaded.data.arrayBuffer());
    return {
      ok: true,
      asset: {
        mediaId: input.mediaId,
        sha256: sha256Hex(bytes),
        bytes: bytes.byteLength,
        mime: "image/webp",
        path: existing.storage_path,
      },
    };
  }

  if (!assertOpeningStoragePath(input.sourcePath)) {
    return { ok: false, reason: "media_not_ready" };
  }
  const source = await sb.storage.from(OPENING_SHOW_BUCKET).download(input.sourcePath);
  if (source.error || !source.data) return { ok: false, reason: "media_not_ready" };
  const sourceBytes = new Uint8Array(await source.data.arrayBuffer());
  const processed = await processOpeningImageBuffer(sourceBytes, input.mime);
  if (!processed.ok) return { ok: false, reason: "derivative_not_ready" };

  const up = await sb.storage.from(OPENING_SHOW_BUCKET).upload(runtimePath, processed.result.display.buf, {
    contentType: "image/webp",
    upsert: true,
  });
  if (up.error) return { ok: false, reason: "derivative_not_ready" };

  const { error: derError } = await sb.from("opening_media_derivatives").upsert(
    {
      media_id: input.mediaId,
      kind: "runtimeDisplay",
      storage_path: runtimePath,
      mime: "image/webp",
      width: processed.result.display.width,
      height: processed.result.display.height,
      byte_size: processed.result.display.buf.byteLength,
    },
    { onConflict: "media_id,kind" }
  );
  if (derError) return { ok: false, reason: "derivative_not_ready" };

  return {
    ok: true,
    asset: {
      mediaId: input.mediaId,
      sha256: sha256Hex(processed.result.display.buf),
      bytes: processed.result.display.buf.byteLength,
      mime: "image/webp",
      path: runtimePath,
    },
  };
}

export async function publishOpeningDraft(
  sb: SupabaseClient,
  input: { showId: string; adminUserId: string }
): Promise<
  | { ok: true; revisionNumber: number; revisionId: string }
  | { ok: false; error: string; httpStatus: number; reason?: OpeningPublishFailReason }
> {
  const { data: draft, error: draftError } = await sb
    .from("opening_drafts")
    .select("document")
    .eq("show_id", input.showId)
    .maybeSingle();
  if (draftError) return { ok: false, error: draftError.message, httpStatus: 500 };
  if (!draft) return { ok: false, error: "not_found", httpStatus: 404 };

  const validated = validateOpeningDocumentForPublish(draft.document);
  if (!validated.ok) {
    const copy = openingPublishFailCopy(validated.reason);
    return { ok: false, error: copy.fallbackEn, httpStatus: 400, reason: validated.reason };
  }

  const uniqueMediaIds = [...new Set(validated.mediaIds)];
  const assets: OpeningRuntimeAsset[] = [];
  if (uniqueMediaIds.length > 0) {
    const { data: mediaRows, error: mediaError } = await sb
      .from("opening_media")
      .select("id, show_id, mime, source_path")
      .eq("show_id", input.showId)
      .in("id", uniqueMediaIds);
    if (mediaError) return { ok: false, error: mediaError.message, httpStatus: 500 };
    const byId = new Map(
      ((mediaRows ?? []) as { id: string; mime: string; source_path: string }[]).map((row) => [row.id, row])
    );
    for (const mediaId of uniqueMediaIds) {
      const row = byId.get(mediaId);
      if (!row) {
        return {
          ok: false,
          error: openingPublishFailCopy("media_not_ready").fallbackEn,
          httpStatus: 400,
          reason: "media_not_ready",
        };
      }
      const ready = await ensureRuntimeDisplay(sb, {
        showId: input.showId,
        mediaId,
        sourcePath: row.source_path,
        mime: row.mime,
      });
      if (!ready.ok) {
        return {
          ok: false,
          error: openingPublishFailCopy(ready.reason).fallbackEn,
          httpStatus: 400,
          reason: ready.reason,
        };
      }
      assets.push({
        mediaId: ready.asset.mediaId,
        url: publicUrl(sb, ready.asset.path),
        sha256: ready.asset.sha256,
        bytes: ready.asset.bytes,
        mime: ready.asset.mime,
      });
    }
  }

  const { data: last, error: lastError } = await sb
    .from("opening_revisions")
    .select("revision_number")
    .eq("show_id", input.showId)
    .order("revision_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastError) return { ok: false, error: lastError.message, httpStatus: 500 };
  const revisionNumber = ((last as { revision_number?: number } | null)?.revision_number ?? 0) + 1;
  const revisionId = globalThis.crypto.randomUUID();
  const scenes: OpeningScene[] = validated.document.scenes;
  const payload: OpeningRevisionPayload = {
    documentVersion: validated.document.version,
    sceneDurationMs: OPENING_RUNTIME_SCENE_DURATION_MS,
    checksum: openingManifestChecksum({
      revisionId,
      assetSha256: assets.map((asset) => asset.sha256),
    }),
    scenes,
    assets,
  };

  const { error: insertError } = await sb.from("opening_revisions").insert({
    id: revisionId,
    show_id: input.showId,
    revision_number: revisionNumber,
    payload,
    published_by: input.adminUserId,
  });
  if (insertError) return { ok: false, error: insertError.message, httpStatus: 500 };

  return { ok: true, revisionNumber, revisionId };
}

export async function setOpeningLive(
  sb: SupabaseClient,
  input: { showId: string; revisionId: string }
): Promise<{ ok: true } | { ok: false; error: string; httpStatus: number }> {
  const { data: revision, error: revError } = await sb
    .from("opening_revisions")
    .select("id, show_id")
    .eq("id", input.revisionId)
    .maybeSingle();
  if (revError) return { ok: false, error: revError.message, httpStatus: 500 };
  if (!revision || revision.show_id !== input.showId) {
    return { ok: false, error: "revision_not_found", httpStatus: 404 };
  }
  const { error } = await sb.rpc("set_opening_live", {
    p_show_id: input.showId,
    p_revision_id: input.revisionId,
  });
  if (error) return { ok: false, error: error.message, httpStatus: 500 };
  return { ok: true };
}

export function openingDocumentFromPayload(payload: OpeningRevisionPayload): OpeningDocument | null {
  return parseOpeningDocument({ version: payload.documentVersion, scenes: payload.scenes });
}
