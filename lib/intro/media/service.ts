import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AppIntroMediaLifecycleState,
  APP_INTRO_STORAGE_BUCKET,
} from "@/lib/intro/db/authority";
import { GifRuntimeFormat } from "@/lib/intro/contracts/gif";
import {
  identifySourceBytes,
  mediaKindForFormat,
  type IdentifiedFormat,
} from "./identify";
import {
  integrityOf,
  integrityMatches,
  PENDING_UPLOAD_INTEGRITY,
} from "./integrity";
import { MediaFailureCategory, MediaPipelineError } from "./failure";
import {
  assertSourcePath,
  buildRuntimeStoragePath,
  buildSourceStoragePath,
  INTRO_MEDIA_BUCKET,
  PROCESS_RECIPE,
  type ProcessRecipeVersion,
} from "./paths";
import { processSourceBytes } from "./processor";

type MediaRow = {
  media_id: string;
  media_kind: "IMAGE" | "LOGO" | "GIF";
  status: string;
  original_name: string;
  mime: string | null;
  byte_length: number | null;
  width: number | null;
  height: number | null;
  source_integrity: string | null;
  current_source_generation_id: string | null;
  current_runtime_artifact_id: string | null;
  failure_code: string | null;
  failure_message: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type SourceGenRow = {
  source_generation_id: string;
  media_id: string;
  generation: number;
  storage_bucket: string;
  storage_path: string;
  byte_length: number;
  integrity: string;
  mime: string | null;
  width: number | null;
  height: number | null;
};

type RuntimeRow = {
  runtime_artifact_id: string;
  media_id: string;
  source_generation_id: string;
  generation: number;
  process_recipe_version: string;
  format: string;
  width: number;
  height: number;
  byte_length: number;
  integrity: string;
  storage_bucket: string;
  storage_path: string;
  animation_metadata: Record<string, unknown> | null;
};

function nowIso() {
  return new Date().toISOString();
}

async function getMedia(
  sb: SupabaseClient,
  mediaId: string,
): Promise<MediaRow> {
  const { data, error } = await sb
    .from("app_intro_media")
    .select("*")
    .eq("media_id", mediaId)
    .maybeSingle();
  if (error) {
    throw new MediaPipelineError(
      MediaFailureCategory.STORAGE_ERROR,
      "Failed to load media",
      error,
    );
  }
  if (!data || data.deleted_at) {
    throw new MediaPipelineError(MediaFailureCategory.NOT_FOUND, "Media not found");
  }
  return data as MediaRow;
}

async function setFailed(
  sb: SupabaseClient,
  mediaId: string,
  userId: string,
  category: MediaFailureCategory,
  message: string,
) {
  await sb
    .from("app_intro_media")
    .update({
      status: AppIntroMediaLifecycleState.FAILED,
      failure_code: category,
      failure_message: message,
      updated_at: nowIso(),
      updated_by: userId,
    })
    .eq("media_id", mediaId);
}

/**
 * CREATE — stable mediaId. Does not mark READY. Does not create runtime artifact.
 * Source generation identity is reserved when signed upload is issued.
 */
export async function createIntroMedia(args: {
  sb: SupabaseClient;
  userId: string;
  mediaKind?: "IMAGE" | "LOGO" | "GIF";
  originalName?: string;
}): Promise<{ mediaId: string; status: string }> {
  const mediaId = randomUUID();
  const { error } = await args.sb.from("app_intro_media").insert({
    media_id: mediaId,
    media_kind: args.mediaKind ?? "IMAGE",
    status: AppIntroMediaLifecycleState.CREATED,
    original_name: args.originalName ?? "",
    created_by: args.userId,
    updated_by: args.userId,
  });
  if (error) {
    throw new MediaPipelineError(
      MediaFailureCategory.STORAGE_ERROR,
      "Failed to create media",
      error,
    );
  }
  return { mediaId, status: AppIntroMediaLifecycleState.CREATED };
}

/**
 * Issue narrow signed upload capability for this media's source path only.
 */
export async function issueSignedSourceUpload(args: {
  sb: SupabaseClient;
  userId: string;
  mediaId: string;
}): Promise<{
  mediaId: string;
  sourceGenerationId: string;
  storagePath: string;
  bucket: string;
  signedUrl: string;
  token: string;
  status: string;
}> {
  const media = await getMedia(args.sb, args.mediaId);
  if (
    media.status !== AppIntroMediaLifecycleState.CREATED &&
    media.status !== AppIntroMediaLifecycleState.UPLOADING &&
    media.status !== AppIntroMediaLifecycleState.FAILED
  ) {
    throw new MediaPipelineError(
      MediaFailureCategory.INVALID_STATE,
      `Cannot issue upload from status ${media.status}`,
    );
  }

  let sourceGenerationId = media.current_source_generation_id;
  let storagePath: string;

  if (sourceGenerationId) {
    const { data: existing } = await args.sb
      .from("app_intro_source_generations")
      .select("*")
      .eq("source_generation_id", sourceGenerationId)
      .maybeSingle();
    if (existing && existing.integrity === PENDING_UPLOAD_INTEGRITY) {
      storagePath = existing.storage_path as string;
    } else if (existing && existing.integrity !== PENDING_UPLOAD_INTEGRITY) {
      // New generation for replace support — old READY remains until replaced later.
      sourceGenerationId = randomUUID();
      const { data: gens } = await args.sb
        .from("app_intro_source_generations")
        .select("generation")
        .eq("media_id", args.mediaId)
        .order("generation", { ascending: false })
        .limit(1);
      const nextGen = ((gens?.[0]?.generation as number | undefined) ?? 0) + 1;
      storagePath = buildSourceStoragePath({
        mediaId: args.mediaId,
        sourceGenerationId,
      });
      assertSourcePath(storagePath);
      const { error: insErr } = await args.sb.from("app_intro_source_generations").insert({
        source_generation_id: sourceGenerationId,
        media_id: args.mediaId,
        generation: nextGen,
        storage_bucket: INTRO_MEDIA_BUCKET,
        storage_path: storagePath,
        byte_length: 0,
        integrity: PENDING_UPLOAD_INTEGRITY,
        created_by: args.userId,
      });
      if (insErr) {
        throw new MediaPipelineError(
          MediaFailureCategory.STORAGE_ERROR,
          "Failed to reserve source generation",
          insErr,
        );
      }
    } else {
      storagePath = buildSourceStoragePath({
        mediaId: args.mediaId,
        sourceGenerationId,
      });
    }
  } else {
    sourceGenerationId = randomUUID();
    storagePath = buildSourceStoragePath({
      mediaId: args.mediaId,
      sourceGenerationId,
    });
    assertSourcePath(storagePath);
    const { error: insErr } = await args.sb.from("app_intro_source_generations").insert({
      source_generation_id: sourceGenerationId,
      media_id: args.mediaId,
      generation: 1,
      storage_bucket: INTRO_MEDIA_BUCKET,
      storage_path: storagePath,
      byte_length: 0,
      integrity: PENDING_UPLOAD_INTEGRITY,
      created_by: args.userId,
    });
    if (insErr) {
      throw new MediaPipelineError(
        MediaFailureCategory.STORAGE_ERROR,
        "Failed to reserve source generation",
        insErr,
      );
    }
  }

  // upsert allows retry of the same reserved source path without broad policies.
  const { data: signed, error: signErr } = await args.sb.storage
    .from(INTRO_MEDIA_BUCKET)
    .createSignedUploadUrl(storagePath, { upsert: true });

  if (signErr || !signed?.signedUrl || !signed?.token) {
    throw new MediaPipelineError(
      MediaFailureCategory.STORAGE_ERROR,
      "Failed to create signed upload capability",
      signErr,
    );
  }

  const { error: upErr } = await args.sb
    .from("app_intro_media")
    .update({
      status: AppIntroMediaLifecycleState.UPLOADING,
      current_source_generation_id: sourceGenerationId,
      failure_code: null,
      failure_message: null,
      updated_at: nowIso(),
      updated_by: args.userId,
    })
    .eq("media_id", args.mediaId);

  if (upErr) {
    throw new MediaPipelineError(
      MediaFailureCategory.STORAGE_ERROR,
      "Failed to mark UPLOADING",
      upErr,
    );
  }

  return {
    mediaId: args.mediaId,
    sourceGenerationId,
    storagePath,
    bucket: INTRO_MEDIA_BUCKET,
    signedUrl: signed.signedUrl,
    token: signed.token,
    status: AppIntroMediaLifecycleState.UPLOADING,
  };
}

/**
 * Confirm source object exists for expected generation; validate bytes; mark UPLOADED.
 * PUT success ≠ READY.
 */
export async function confirmSourceUpload(args: {
  sb: SupabaseClient;
  userId: string;
  mediaId: string;
}): Promise<{
  mediaId: string;
  sourceGenerationId: string;
  status: string;
  identified: {
    format: IdentifiedFormat;
    mime: string;
    width: number;
    height: number;
    pages: number;
    animated: boolean;
  };
  integrity: string;
  byteLength: number;
}> {
  const media = await getMedia(args.sb, args.mediaId);
  if (
    media.status !== AppIntroMediaLifecycleState.UPLOADING &&
    media.status !== AppIntroMediaLifecycleState.UPLOADED
  ) {
    throw new MediaPipelineError(
      MediaFailureCategory.INVALID_STATE,
      `Cannot confirm upload from status ${media.status}`,
    );
  }
  if (!media.current_source_generation_id) {
    throw new MediaPipelineError(
      MediaFailureCategory.INVALID_STATE,
      "Missing source generation",
    );
  }

  const { data: gen, error: genErr } = await args.sb
    .from("app_intro_source_generations")
    .select("*")
    .eq("source_generation_id", media.current_source_generation_id)
    .maybeSingle();
  if (genErr || !gen) {
    throw new MediaPipelineError(
      MediaFailureCategory.SOURCE_MISSING,
      "Source generation not found",
      genErr,
    );
  }
  const source = gen as SourceGenRow;
  assertSourcePath(source.storage_path);

  const { data: blob, error: dlErr } = await args.sb.storage
    .from(source.storage_bucket || INTRO_MEDIA_BUCKET)
    .download(source.storage_path);
  if (dlErr || !blob) {
    throw new MediaPipelineError(
      MediaFailureCategory.SOURCE_MISSING,
      "Source object missing in storage",
      dlErr,
    );
  }

  const bytes = Buffer.from(await blob.arrayBuffer());
  let identified;
  try {
    identified = await identifySourceBytes(bytes);
  } catch (err) {
    const cat =
      err instanceof MediaPipelineError
        ? err.category
        : MediaFailureCategory.MALFORMED_SOURCE;
    const msg =
      err instanceof MediaPipelineError ? err.safeMessage : "Invalid source";
    await setFailed(args.sb, args.mediaId, args.userId, cat, msg);
    throw err;
  }

  const integrity = integrityOf(bytes);
  if (
    source.integrity !== PENDING_UPLOAD_INTEGRITY &&
    source.integrity !== integrity
  ) {
    throw new MediaPipelineError(
      MediaFailureCategory.SOURCE_INTEGRITY_MISMATCH,
      "Source path exists with conflicting integrity",
    );
  }

  if (source.integrity === PENDING_UPLOAD_INTEGRITY) {
    const { error: finErr } = await args.sb
      .from("app_intro_source_generations")
      .update({
        byte_length: bytes.length,
        integrity,
        mime: identified.mime,
        width: identified.width,
        height: identified.height,
      })
      .eq("source_generation_id", source.source_generation_id)
      .eq("integrity", PENDING_UPLOAD_INTEGRITY);
    if (finErr) {
      throw new MediaPipelineError(
        MediaFailureCategory.STORAGE_ERROR,
        "Failed to finalize source generation",
        finErr,
      );
    }
  }

  const kind = mediaKindForFormat(identified.format, media.media_kind);
  const { error: mediaErr } = await args.sb
    .from("app_intro_media")
    .update({
      status: AppIntroMediaLifecycleState.UPLOADED,
      media_kind: kind,
      mime: identified.mime,
      byte_length: bytes.length,
      width: identified.width,
      height: identified.height,
      source_integrity: integrity,
      failure_code: null,
      failure_message: null,
      updated_at: nowIso(),
      updated_by: args.userId,
    })
    .eq("media_id", args.mediaId);
  if (mediaErr) {
    throw new MediaPipelineError(
      MediaFailureCategory.STORAGE_ERROR,
      "Failed to mark UPLOADED",
      mediaErr,
    );
  }

  return {
    mediaId: args.mediaId,
    sourceGenerationId: source.source_generation_id,
    status: AppIntroMediaLifecycleState.UPLOADED,
    identified: {
      format: identified.format,
      mime: identified.mime,
      width: identified.width,
      height: identified.height,
      pages: identified.pages,
      animated: identified.animated,
    },
    integrity,
    byteLength: bytes.length,
  };
}

function recipeForFormat(format: IdentifiedFormat): ProcessRecipeVersion {
  return format === "GIF"
    ? PROCESS_RECIPE.GIF_B2_SHARP_OMGGIF_V1
    : PROCESS_RECIPE.STATIC_ORIENT_ALPHA_V1;
}

function runtimeExt(format: string): string {
  if (format === GifRuntimeFormat.CANONICAL_ANIMATED_GIF || format === "GIF") {
    return "gif";
  }
  return format.toLowerCase();
}

/**
 * PROCESS → immutable READY runtime artifact.
 * Order: process bytes → write object → verify → DB READY.
 */
export async function processIntroMedia(args: {
  sb: SupabaseClient;
  userId: string;
  mediaId: string;
}): Promise<{
  mediaId: string;
  status: string;
  runtimeArtifactId: string;
  integrity: string;
  format: string;
  width: number;
  height: number;
  byteLength: number;
  animationMetadata: Record<string, unknown> | null;
  processRecipeVersion: string;
  reused: boolean;
}> {
  const media = await getMedia(args.sb, args.mediaId);

  // Idempotent: already READY with runtime
  if (
    media.status === AppIntroMediaLifecycleState.READY &&
    media.current_runtime_artifact_id
  ) {
    const { data: rt } = await args.sb
      .from("app_intro_runtime_artifacts")
      .select("*")
      .eq("runtime_artifact_id", media.current_runtime_artifact_id)
      .maybeSingle();
    if (rt) {
      const row = rt as RuntimeRow;
      return {
        mediaId: args.mediaId,
        status: AppIntroMediaLifecycleState.READY,
        runtimeArtifactId: row.runtime_artifact_id,
        integrity: row.integrity,
        format: row.format,
        width: row.width,
        height: row.height,
        byteLength: row.byte_length,
        animationMetadata: row.animation_metadata,
        processRecipeVersion: row.process_recipe_version,
        reused: true,
      };
    }
  }

  if (
    media.status !== AppIntroMediaLifecycleState.UPLOADED &&
    media.status !== AppIntroMediaLifecycleState.PROCESSING &&
    media.status !== AppIntroMediaLifecycleState.FAILED
  ) {
    throw new MediaPipelineError(
      MediaFailureCategory.INVALID_STATE,
      `Cannot process from status ${media.status}`,
    );
  }
  if (!media.current_source_generation_id) {
    throw new MediaPipelineError(
      MediaFailureCategory.INVALID_STATE,
      "No source generation to process",
    );
  }

  const { data: gen } = await args.sb
    .from("app_intro_source_generations")
    .select("*")
    .eq("source_generation_id", media.current_source_generation_id)
    .maybeSingle();
  if (!gen || (gen as SourceGenRow).integrity === PENDING_UPLOAD_INTEGRITY) {
    throw new MediaPipelineError(
      MediaFailureCategory.SOURCE_MISSING,
      "Source not finalized",
    );
  }
  const source = gen as SourceGenRow;

  // Existing artifact for same source+recipe?
  const identifiedHint = await (async () => {
    const { data: blob } = await args.sb.storage
      .from(source.storage_bucket)
      .download(source.storage_path);
    if (!blob) {
      throw new MediaPipelineError(
        MediaFailureCategory.SOURCE_MISSING,
        "Source object missing",
      );
    }
    const bytes = Buffer.from(await blob.arrayBuffer());
    if (!integrityMatches(source.integrity, bytes)) {
      throw new MediaPipelineError(
        MediaFailureCategory.SOURCE_INTEGRITY_MISMATCH,
        "Source integrity mismatch",
      );
    }
    return { bytes, identified: await identifySourceBytes(bytes) };
  })();

  const recipe = recipeForFormat(identifiedHint.identified.format);

  const { data: existingRt } = await args.sb
    .from("app_intro_runtime_artifacts")
    .select("*")
    .eq("source_generation_id", source.source_generation_id)
    .eq("process_recipe_version", recipe)
    .maybeSingle();

  if (existingRt) {
    const row = existingRt as RuntimeRow;
    const { data: obj } = await args.sb.storage
      .from(row.storage_bucket)
      .download(row.storage_path);
    if (!obj) {
      throw new MediaPipelineError(
        MediaFailureCategory.IDEMPOTENCY_CONFLICT,
        "Runtime artifact row exists but object missing",
      );
    }
    const objBytes = Buffer.from(await obj.arrayBuffer());
    if (!integrityMatches(row.integrity, objBytes)) {
      throw new MediaPipelineError(
        MediaFailureCategory.IDEMPOTENCY_CONFLICT,
        "Runtime path exists with conflicting bytes",
      );
    }
    await args.sb
      .from("app_intro_media")
      .update({
        status: AppIntroMediaLifecycleState.READY,
        current_runtime_artifact_id: row.runtime_artifact_id,
        failure_code: null,
        failure_message: null,
        updated_at: nowIso(),
        updated_by: args.userId,
      })
      .eq("media_id", args.mediaId);
    return {
      mediaId: args.mediaId,
      status: AppIntroMediaLifecycleState.READY,
      runtimeArtifactId: row.runtime_artifact_id,
      integrity: row.integrity,
      format: row.format,
      width: row.width,
      height: row.height,
      byteLength: row.byte_length,
      animationMetadata: row.animation_metadata,
      processRecipeVersion: row.process_recipe_version,
      reused: true,
    };
  }

  await args.sb
    .from("app_intro_media")
    .update({
      status: AppIntroMediaLifecycleState.PROCESSING,
      failure_code: null,
      failure_message: null,
      updated_at: nowIso(),
      updated_by: args.userId,
    })
    .eq("media_id", args.mediaId);

  let processed;
  try {
    processed = await processSourceBytes(identifiedHint.bytes);
  } catch (err) {
    const cat =
      err instanceof MediaPipelineError
        ? err.category
        : MediaFailureCategory.PROCESSOR_FAILED;
    const msg =
      err instanceof MediaPipelineError ? err.safeMessage : "Processor failed";
    await setFailed(args.sb, args.mediaId, args.userId, cat, msg);
    throw err;
  }

  const runtimeArtifactId = randomUUID();
  const ext = runtimeExt(processed.format);
  const storagePath = buildRuntimeStoragePath({
    mediaId: args.mediaId,
    runtimeArtifactId,
    ext,
  });
  const integrity = integrityOf(processed.bytes);

  const { error: upErr } = await args.sb.storage
    .from(INTRO_MEDIA_BUCKET)
    .upload(storagePath, processed.bytes, {
      contentType: processed.mime,
      upsert: false,
    });
  if (upErr) {
    await setFailed(
      args.sb,
      args.mediaId,
      args.userId,
      MediaFailureCategory.RUNTIME_WRITE_FAILED,
      "Failed to write runtime object",
    );
    throw new MediaPipelineError(
      MediaFailureCategory.RUNTIME_WRITE_FAILED,
      "Failed to write runtime object",
      upErr,
    );
  }

  const { data: verifyBlob, error: verifyErr } = await args.sb.storage
    .from(INTRO_MEDIA_BUCKET)
    .download(storagePath);
  if (verifyErr || !verifyBlob) {
    await setFailed(
      args.sb,
      args.mediaId,
      args.userId,
      MediaFailureCategory.RUNTIME_VERIFY_FAILED,
      "Runtime object verification failed",
    );
    throw new MediaPipelineError(
      MediaFailureCategory.RUNTIME_VERIFY_FAILED,
      "Runtime object verification failed",
      verifyErr,
    );
  }
  const verifyBytes = Buffer.from(await verifyBlob.arrayBuffer());
  if (!integrityMatches(integrity, verifyBytes)) {
    await setFailed(
      args.sb,
      args.mediaId,
      args.userId,
      MediaFailureCategory.RUNTIME_VERIFY_FAILED,
      "Runtime integrity mismatch after write",
    );
    throw new MediaPipelineError(
      MediaFailureCategory.RUNTIME_VERIFY_FAILED,
      "Runtime integrity mismatch after write",
    );
  }

  const { data: gens } = await args.sb
    .from("app_intro_runtime_artifacts")
    .select("generation")
    .eq("media_id", args.mediaId)
    .order("generation", { ascending: false })
    .limit(1);
  const nextGen = ((gens?.[0]?.generation as number | undefined) ?? 0) + 1;

  const { error: rtInsErr } = await args.sb.from("app_intro_runtime_artifacts").insert({
    runtime_artifact_id: runtimeArtifactId,
    media_id: args.mediaId,
    source_generation_id: source.source_generation_id,
    generation: nextGen,
    process_recipe_version: processed.processRecipeVersion,
    format: processed.format,
    width: processed.width,
    height: processed.height,
    byte_length: processed.byteLength,
    integrity,
    storage_bucket: INTRO_MEDIA_BUCKET,
    storage_path: storagePath,
    animation_metadata: processed.animationMetadata,
    created_by: args.userId,
  });

  if (rtInsErr) {
    // Object is unreferenced cleanup candidate — not READY authority.
    await setFailed(
      args.sb,
      args.mediaId,
      args.userId,
      MediaFailureCategory.STORAGE_ERROR,
      "Failed to commit runtime artifact row",
    );
    throw new MediaPipelineError(
      MediaFailureCategory.STORAGE_ERROR,
      "Failed to commit runtime artifact row",
      rtInsErr,
    );
  }

  const { error: readyErr } = await args.sb
    .from("app_intro_media")
    .update({
      status: AppIntroMediaLifecycleState.READY,
      current_runtime_artifact_id: runtimeArtifactId,
      width: processed.width,
      height: processed.height,
      failure_code: null,
      failure_message: null,
      updated_at: nowIso(),
      updated_by: args.userId,
    })
    .eq("media_id", args.mediaId);

  if (readyErr) {
    await setFailed(
      args.sb,
      args.mediaId,
      args.userId,
      MediaFailureCategory.STORAGE_ERROR,
      "Runtime object written but READY commit failed",
    );
    throw new MediaPipelineError(
      MediaFailureCategory.STORAGE_ERROR,
      "Runtime object written but READY commit failed",
      readyErr,
    );
  }

  return {
    mediaId: args.mediaId,
    status: AppIntroMediaLifecycleState.READY,
    runtimeArtifactId,
    integrity,
    format: processed.format,
    width: processed.width,
    height: processed.height,
    byteLength: processed.byteLength,
    animationMetadata: processed.animationMetadata as Record<string, unknown>,
    processRecipeVersion: processed.processRecipeVersion,
    reused: false,
  };
}

export async function getIntroMedia(args: {
  sb: SupabaseClient;
  mediaId: string;
}): Promise<{
  media: MediaRow;
  source: SourceGenRow | null;
  runtime: RuntimeRow | null;
}> {
  const media = await getMedia(args.sb, args.mediaId);
  let source: SourceGenRow | null = null;
  let runtime: RuntimeRow | null = null;
  if (media.current_source_generation_id) {
    const { data } = await args.sb
      .from("app_intro_source_generations")
      .select("*")
      .eq("source_generation_id", media.current_source_generation_id)
      .maybeSingle();
    source = (data as SourceGenRow) ?? null;
  }
  if (media.current_runtime_artifact_id) {
    const { data } = await args.sb
      .from("app_intro_runtime_artifacts")
      .select("*")
      .eq("runtime_artifact_id", media.current_runtime_artifact_id)
      .maybeSingle();
    runtime = (data as RuntimeRow) ?? null;
  }
  return { media, source, runtime };
}

export async function listIntroMedia(args: {
  sb: SupabaseClient;
  limit?: number;
}): Promise<
  Array<{
    mediaId: string;
    status: string;
    mediaKind: string;
    originalName: string;
    mime: string | null;
    width: number | null;
    height: number | null;
    runtimeArtifactId: string | null;
    failureCode: string | null;
    updatedAt: string;
  }>
> {
  const { data, error } = await args.sb
    .from("app_intro_media")
    .select(
      "media_id,status,media_kind,original_name,mime,width,height,current_runtime_artifact_id,failure_code,updated_at,deleted_at",
    )
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(args.limit ?? 100);
  if (error) {
    throw new MediaPipelineError(
      MediaFailureCategory.STORAGE_ERROR,
      "Failed to list media",
      error,
    );
  }
  return (data ?? []).map((row) => ({
    mediaId: row.media_id as string,
    status: row.status as string,
    mediaKind: row.media_kind as string,
    originalName: row.original_name as string,
    mime: row.mime as string | null,
    width: row.width as number | null,
    height: row.height as number | null,
    runtimeArtifactId: row.current_runtime_artifact_id as string | null,
    failureCode: row.failure_code as string | null,
    updatedAt: row.updated_at as string,
  }));
}

/**
 * Delete backend seam: block when draft-referenced.
 * Phase 4 owns full UX; here we enforce the safety rule.
 */
export async function deleteIntroMediaBackend(args: {
  sb: SupabaseClient;
  userId: string;
  mediaId: string;
}): Promise<{ deleted: boolean; blocked?: string }> {
  const media = await getMedia(args.sb, args.mediaId);

  // Scan draft documents for mediaId references in JSONB (authored SSOT).
  const { data: docs } = await args.sb
    .from("app_intro_documents")
    .select("document_id, document")
    .limit(200);
  for (const doc of docs ?? []) {
    const raw = JSON.stringify(doc.document ?? {});
    if (raw.includes(args.mediaId)) {
      throw new MediaPipelineError(
        MediaFailureCategory.DELETE_BLOCKED_DRAFT_REF,
        "Media is referenced by a draft document",
      );
    }
  }

  // Soft-delete media; retain runtime objects while historically referenced.
  const { error } = await args.sb
    .from("app_intro_media")
    .update({
      status: AppIntroMediaLifecycleState.DELETED,
      deleted_at: nowIso(),
      updated_at: nowIso(),
      updated_by: args.userId,
    })
    .eq("media_id", args.mediaId);
  if (error) {
    throw new MediaPipelineError(
      MediaFailureCategory.STORAGE_ERROR,
      "Failed to delete media",
      error,
    );
  }
  void media;
  return { deleted: true };
}

export { APP_INTRO_STORAGE_BUCKET, INTRO_MEDIA_BUCKET };
