import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AppIntroMediaLifecycleState,
  APP_INTRO_STORAGE_BUCKET,
} from "@/lib/intro/db/authority";
import { MediaPipelineError } from "@/lib/intro/media/failure";
import {
  identifySourceBytes,
  mediaKindForFormat,
} from "@/lib/intro/media/identify";
import { integrityOf } from "@/lib/intro/media/integrity";
import {
  buildRuntimeStoragePath,
  buildSourceStoragePath,
} from "@/lib/intro/media/paths";
import { processSourceBytes } from "@/lib/intro/media/processor";

export type IntroMediaListItem = {
  mediaId: string;
  mediaKind: "IMAGE" | "LOGO" | "GIF";
  status: string;
  originalName: string;
  width: number | null;
  height: number | null;
  mime: string | null;
  previewUrl: string | null;
  updatedAt: string;
};

function extForRuntimeFormat(format: string): string {
  switch (format) {
    case "JPEG":
      return "jpg";
    case "PNG":
      return "png";
    case "WEBP":
      return "webp";
    case "GIF":
    case "CANONICAL_ANIMATED_GIF":
      return "gif";
    default:
      return "bin";
  }
}

export async function listReadyIntroMedia(
  sb: SupabaseClient,
): Promise<IntroMediaListItem[]> {
  const { data, error } = await sb
    .from("app_intro_media")
    .select(
      "media_id, media_kind, status, original_name, mime, width, height, updated_at, current_runtime_artifact_id",
    )
    .eq("status", "READY")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);

  const items: IntroMediaListItem[] = [];
  for (const row of data ?? []) {
    let previewUrl: string | null = null;
    if (row.current_runtime_artifact_id) {
      const { data: rt } = await sb
        .from("app_intro_runtime_artifacts")
        .select("storage_bucket, storage_path")
        .eq("runtime_artifact_id", row.current_runtime_artifact_id)
        .maybeSingle();
      if (rt?.storage_path) {
        const { data: signed } = await sb.storage
          .from(rt.storage_bucket || APP_INTRO_STORAGE_BUCKET)
          .createSignedUrl(rt.storage_path, 60 * 30);
        previewUrl = signed?.signedUrl ?? null;
      }
    }
    items.push({
      mediaId: row.media_id,
      mediaKind: row.media_kind,
      status: row.status,
      originalName: row.original_name,
      width: row.width,
      height: row.height,
      mime: row.mime,
      previewUrl,
      updatedAt: row.updated_at,
    });
  }
  return items;
}

/**
 * Upload → identify → process → verify download integrity → READY.
 * Storage PUT alone is never READY.
 */
export async function uploadAndReadyIntroMedia(
  sb: SupabaseClient,
  args: {
    bytes: Buffer;
    originalName: string;
    userId: string;
    asLogo?: boolean;
  },
): Promise<IntroMediaListItem> {
  let identified;
  try {
    identified = await identifySourceBytes(args.bytes);
  } catch (e) {
    const msg = e instanceof MediaPipelineError ? e.message : String(e);
    throw new Error(`identify_failed:${msg}`);
  }

  const mediaKind = mediaKindForFormat(
    identified.format,
    args.asLogo ? "LOGO" : undefined,
  );
  const mediaId = randomUUID();
  const sourceGenerationId = randomUUID();
  const runtimeArtifactId = randomUUID();
  const sourceIntegrity = integrityOf(args.bytes);
  const sourcePath = buildSourceStoragePath({ mediaId, sourceGenerationId });

  const { error: mediaInsErr } = await sb.from("app_intro_media").insert({
    media_id: mediaId,
    media_kind: mediaKind,
    status: AppIntroMediaLifecycleState.PROCESSING,
    original_name: args.originalName || "upload",
    mime: identified.mime,
    byte_length: args.bytes.byteLength,
    width: identified.width,
    height: identified.height,
    source_integrity: sourceIntegrity,
    created_by: args.userId,
    updated_by: args.userId,
  });
  if (mediaInsErr) throw new Error(mediaInsErr.message);

  const { error: upSourceErr } = await sb.storage
    .from(APP_INTRO_STORAGE_BUCKET)
    .upload(sourcePath, args.bytes, {
      contentType: identified.mime,
      upsert: false,
    });
  if (upSourceErr) {
    await markFailed(sb, mediaId, "SOURCE_UPLOAD", upSourceErr.message);
    throw new Error(`source_upload:${upSourceErr.message}`);
  }

  const { error: srcGenErr } = await sb.from("app_intro_source_generations").insert({
    source_generation_id: sourceGenerationId,
    media_id: mediaId,
    generation: 1,
    storage_bucket: APP_INTRO_STORAGE_BUCKET,
    storage_path: sourcePath,
    byte_length: args.bytes.byteLength,
    integrity: sourceIntegrity,
    mime: identified.mime,
    width: identified.width,
    height: identified.height,
    created_by: args.userId,
  });
  if (srcGenErr) throw new Error(srcGenErr.message);

  let processed;
  try {
    processed = await processSourceBytes(args.bytes);
  } catch (e) {
    const msg = e instanceof MediaPipelineError ? e.message : String(e);
    await markFailed(sb, mediaId, "PROCESS", msg);
    throw new Error(`process_failed:${msg}`);
  }

  const runtimeIntegrity = integrityOf(processed.bytes);
  const ext = extForRuntimeFormat(processed.format);
  const runtimePath = buildRuntimeStoragePath({
    mediaId,
    runtimeArtifactId,
    ext,
  });

  const { error: upRtErr } = await sb.storage
    .from(APP_INTRO_STORAGE_BUCKET)
    .upload(runtimePath, processed.bytes, {
      contentType: processed.mime,
      upsert: false,
    });
  if (upRtErr) {
    await markFailed(sb, mediaId, "RUNTIME_UPLOAD", upRtErr.message);
    throw new Error(`runtime_upload:${upRtErr.message}`);
  }

  const { data: downloaded, error: dlErr } = await sb.storage
    .from(APP_INTRO_STORAGE_BUCKET)
    .download(runtimePath);
  if (dlErr || !downloaded) {
    await markFailed(sb, mediaId, "RUNTIME_VERIFY", dlErr?.message ?? "missing");
    throw new Error(`runtime_verify_download:${dlErr?.message ?? "missing"}`);
  }
  const dlBuf = Buffer.from(await downloaded.arrayBuffer());
  if (integrityOf(dlBuf) !== runtimeIntegrity) {
    await markFailed(sb, mediaId, "RUNTIME_VERIFY", "integrity_mismatch");
    throw new Error("runtime_verify_integrity_mismatch");
  }

  const { error: rtInsErr } = await sb.from("app_intro_runtime_artifacts").insert({
    runtime_artifact_id: runtimeArtifactId,
    media_id: mediaId,
    source_generation_id: sourceGenerationId,
    generation: 1,
    process_recipe_version: processed.processRecipeVersion,
    format: processed.format,
    width: processed.width,
    height: processed.height,
    byte_length: processed.byteLength,
    integrity: runtimeIntegrity,
    storage_bucket: APP_INTRO_STORAGE_BUCKET,
    storage_path: runtimePath,
    animation_metadata: processed.animationMetadata ?? null,
    created_by: args.userId,
  });
  if (rtInsErr) throw new Error(rtInsErr.message);

  const { error: readyErr } = await sb
    .from("app_intro_media")
    .update({
      status: AppIntroMediaLifecycleState.READY,
      current_source_generation_id: sourceGenerationId,
      current_runtime_artifact_id: runtimeArtifactId,
      width: processed.width,
      height: processed.height,
      mime: processed.mime,
      byte_length: processed.byteLength,
      source_integrity: sourceIntegrity,
      updated_by: args.userId,
      updated_at: new Date().toISOString(),
      failure_code: null,
      failure_message: null,
    })
    .eq("media_id", mediaId);
  if (readyErr) throw new Error(readyErr.message);

  const { data: signed } = await sb.storage
    .from(APP_INTRO_STORAGE_BUCKET)
    .createSignedUrl(runtimePath, 60 * 30);

  return {
    mediaId,
    mediaKind,
    status: "READY",
    originalName: args.originalName || "upload",
    width: processed.width,
    height: processed.height,
    mime: processed.mime,
    previewUrl: signed?.signedUrl ?? null,
    updatedAt: new Date().toISOString(),
  };
}

async function markFailed(
  sb: SupabaseClient,
  mediaId: string,
  code: string,
  message: string,
) {
  await sb
    .from("app_intro_media")
    .update({
      status: "FAILED",
      failure_code: code,
      failure_message: message.slice(0, 500),
    })
    .eq("media_id", mediaId);
}

export async function getReadyRuntimeForMedia(
  sb: SupabaseClient,
  mediaId: string,
): Promise<{
  mediaId: string;
  runtimeArtifactId: string;
  integrity: string;
  storagePath: string;
  storageBucket: string;
  width: number;
  height: number;
  format: string;
  mime: string | null;
  bytes: Buffer;
  ext: string;
} | null> {
  const { data: media } = await sb
    .from("app_intro_media")
    .select("media_id, status, current_runtime_artifact_id, mime")
    .eq("media_id", mediaId)
    .maybeSingle();
  if (!media || media.status !== "READY" || !media.current_runtime_artifact_id) {
    return null;
  }
  const { data: rt } = await sb
    .from("app_intro_runtime_artifacts")
    .select("*")
    .eq("runtime_artifact_id", media.current_runtime_artifact_id)
    .maybeSingle();
  if (!rt) return null;
  const { data: blob, error } = await sb.storage
    .from(rt.storage_bucket || APP_INTRO_STORAGE_BUCKET)
    .download(rt.storage_path);
  if (error || !blob) return null;
  const bytes = Buffer.from(await blob.arrayBuffer());
  if (integrityOf(bytes) !== rt.integrity) {
    throw new Error(`runtime_integrity_drift:${mediaId}`);
  }
  return {
    mediaId,
    runtimeArtifactId: rt.runtime_artifact_id,
    integrity: rt.integrity,
    storagePath: rt.storage_path,
    storageBucket: rt.storage_bucket,
    width: rt.width,
    height: rt.height,
    format: rt.format,
    mime: media.mime,
    bytes,
    ext: extForRuntimeFormat(rt.format),
  };
}
