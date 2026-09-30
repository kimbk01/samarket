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
  mediaKind: "IMAGE" | "LOGO" | "GIF" | "VIDEO";
  status: string;
  originalName: string;
  /** Operator-facing name; falls back to originalName. */
  displayName: string;
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
    case "MP4":
      return "mp4";
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
      "media_id, media_kind, status, original_name, display_name, mime, width, height, updated_at, current_runtime_artifact_id",
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
    const originalName = row.original_name || "media";
    const displayName =
      (typeof row.display_name === "string" && row.display_name.trim()) ||
      operatorDisplayName(originalName);
    items.push({
      mediaId: row.media_id,
      mediaKind: row.media_kind,
      status: row.status,
      originalName,
      displayName,
      width: row.width,
      height: row.height,
      mime: row.mime,
      previewUrl,
      updatedAt: row.updated_at,
    });
  }
  return items;
}

function operatorDisplayName(originalName: string): string {
  const base = originalName.replace(/\.(bin|tmp)$/i, "").trim();
  if (/^[0-9a-f-]{36}/i.test(base)) return "업로드 이미지";
  if (/^phase\d/i.test(base) || /^qa-/i.test(base) || /^cuta-/i.test(base)) {
    return "테스트 미디어";
  }
  return base || "미디어";
}

function displayNameFromOriginal(originalName: string, mediaKind: IntroMediaListItem["mediaKind"]): string {
  const leaf = originalName.replace(/^.*[/\\]/, "").trim();
  if (mediaKind === "VIDEO") {
    const withoutExt = leaf.replace(/\.[^.]+$/i, "").trim();
    return withoutExt || leaf || "영상";
  }
  return operatorDisplayName(originalName);
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
  const uploadDisplayName = displayNameFromOriginal(args.originalName || "upload", mediaKind);
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
    display_name: uploadDisplayName,
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

  const originalName = args.originalName || "upload";
  return {
    mediaId,
    mediaKind,
    status: "READY",
    originalName,
    displayName: uploadDisplayName,
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

export type MediaUsageRef = {
  documentId: string;
  title: string;
  sceneName: string;
};

/** Find Intro draft documents that reference this mediaId. */
export async function findIntroMediaUsages(
  sb: SupabaseClient,
  mediaId: string,
): Promise<MediaUsageRef[]> {
  const { data, error } = await sb
    .from("app_intro_documents")
    .select("document_id, title, document")
    .limit(200);
  if (error) throw new Error(error.message);
  const out: MediaUsageRef[] = [];
  for (const row of data ?? []) {
    const doc = row.document as {
      scenes?: Array<{
        name?: string;
        background?: { type?: string; mediaId?: string };
        elements?: Array<{
          type?: string;
          payload?: { mediaId?: string };
        }>;
      }>;
    } | null;
    if (!doc?.scenes) continue;
    doc.scenes.forEach((scene, i) => {
      const sceneName = (scene.name || "").trim() || `장면 ${i + 1}`;
      if (scene.background?.type === "IMAGE" && scene.background.mediaId === mediaId) {
        out.push({
          documentId: row.document_id,
          title: row.title,
          sceneName,
        });
      }
      for (const el of scene.elements ?? []) {
        if (
          (el.type === "IMAGE" || el.type === "LOGO" || el.type === "VIDEO") &&
          el.payload?.mediaId === mediaId
        ) {
          out.push({
            documentId: row.document_id,
            title: row.title,
            sceneName,
          });
        }
      }
    });
  }
  return out;
}

/**
 * Soft-delete library asset.
 * In-use assets are blocked with human-readable usage list.
 */
export async function softDeleteIntroMedia(
  sb: SupabaseClient,
  mediaId: string,
): Promise<{ deleted: true }> {
  const usages = await findIntroMediaUsages(sb, mediaId);
  if (usages.length > 0) {
    const u = usages[0]!;
    throw new Error(
      `이 미디어는 '${u.title}' → '${u.sceneName}' 에서 사용 중입니다. 먼저 장면에서 제거해 주세요.`,
    );
  }
  const { data, error } = await sb
    .from("app_intro_media")
    .update({
      status: "DELETED",
      deleted_at: new Date().toISOString(),
    })
    .eq("media_id", mediaId)
    .is("deleted_at", null)
    .select("media_id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("media_not_found");
  return { deleted: true };
}

export async function renameIntroMedia(
  sb: SupabaseClient,
  mediaId: string,
  displayName: string,
): Promise<void> {
  const name = displayName.trim();
  if (!name) throw new Error("이름을 입력해 주세요.");
  const { error } = await sb
    .from("app_intro_media")
    .update({ display_name: name, updated_at: new Date().toISOString() })
    .eq("media_id", mediaId)
    .is("deleted_at", null);
  if (error) throw new Error(error.message);
}
