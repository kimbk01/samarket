/**
 * DIBAY INTRO — V1 Publish service
 * REAL DRAFT → PUBLISH → REVISION → SEAL → PACK
 *
 * State machine: PREPARING → READY_TO_COMMIT → COMMITTED | FAILED
 * Idempotency: documentId + sourceDraftVersion + idempotencyKey
 * Capture-once: Draft N and READY runtime A never re-read as "latest".
 * Live is NEVER mutated.
 */

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { IntroDocumentV1 } from "@/lib/intro/contracts/document";
import type {
  CapturedRuntimeMediaPinV1,
  IntroPackAssetEntryV1,
  IntroPackV1,
} from "@/lib/intro/contracts/pack";
import {
  INTRO_AUTHORITY_GENERATION,
  INTRO_FONT_SPEC_VERSION,
  INTRO_PACK_SCHEMA_VERSION,
  INTRO_PROTOCOL_VERSION,
  INTRO_RENDER_SPEC_VERSION,
} from "@/lib/intro/contracts/pack";
import { GifRuntimeFormat } from "@/lib/intro/contracts/gif";
import {
  APP_INTRO_STORAGE_BUCKET,
  AppIntroMediaLifecycleState,
  AppIntroPublishOpStatus,
  AppIntroLiveKind,
} from "@/lib/intro/db/authority";
import { canonicalizeAuthoredDocument } from "@/lib/intro/document/canonical-equality";
import { integrityMatches, integrityOf } from "@/lib/intro/media/integrity";
import { validatePublish } from "@/lib/intro/validation/core";
import {
  buildIntroPackV1,
  documentDigestOf,
  packSummaryForReport,
} from "@/lib/intro/pack/canonical";
import { auditNativeConsumability } from "@/lib/intro/pack/consumability";
import {
  assertPackPath,
  assertSealedPath,
  buildPackAssetStoragePath,
  buildPackManifestStoragePath,
  buildSealedStoragePath,
  packRelativeAssetPath,
} from "@/lib/intro/pack/paths";
import { collectAuthoredMediaRefIds } from "./collect-media";
import {
  PublishConflictError,
  PublishFailedOpError,
  PublishNotFoundError,
  PublishSealCollisionError,
  PublishValidationError,
} from "./errors";

type DocRow = {
  document_id: string;
  draft_version: number;
  document: IntroDocumentV1 | Record<string, unknown>;
};

type RuntimeRow = {
  runtime_artifact_id: string;
  media_id: string;
  format: string;
  width: number;
  height: number;
  byte_length: number;
  integrity: string;
  storage_bucket: string;
  storage_path: string;
  animation_metadata: Record<string, unknown> | null;
};

type MediaRow = {
  media_id: string;
  media_kind: "IMAGE" | "LOGO" | "GIF";
  status: string;
  mime: string | null;
  current_runtime_artifact_id: string | null;
  deleted_at: string | null;
};

type PublishOpRow = {
  publish_operation_id: string;
  document_id: string;
  source_draft_version: number;
  idempotency_key: string;
  status: string;
  captured_document: IntroDocumentV1;
  captured_runtime_set: CapturedRuntimeMediaPinV1[];
  failure_code: string | null;
  failure_message: string | null;
};

type RevisionRow = {
  published_revision_id: string;
  document_id: string;
  publish_operation_id: string;
  source_draft_version: number;
  publish_state: string;
  document_snapshot: IntroDocumentV1;
  document_integrity: string;
  pack_id: string | null;
  manifest_integrity: string | null;
  asset_set_integrity: string | null;
};

function nowIso() {
  return new Date().toISOString();
}

function extForFormat(format: string, mime: string): string {
  if (format === GifRuntimeFormat.CANONICAL_ANIMATED_GIF || mime === "image/gif") {
    return "gif";
  }
  if (mime === "image/png" || format === "image/png" || format === "PNG") return "png";
  if (mime === "image/webp" || format === "image/webp" || format === "WEBP") {
    return "webp";
  }
  if (mime === "image/jpeg" || format === "image/jpeg" || format === "JPEG") {
    return "jpg";
  }
  const m = mime.split("/")[1];
  return (m || "bin").toLowerCase();
}

function mimeForPin(pin: CapturedRuntimeMediaPinV1): string {
  if (pin.format === GifRuntimeFormat.CANONICAL_ANIMATED_GIF) return "image/gif";
  if (pin.mime) return pin.mime;
  return "application/octet-stream";
}

function kindForPin(mediaKind: string, format: string): "IMAGE" | "LOGO" | "GIF" {
  if (format === GifRuntimeFormat.CANONICAL_ANIMATED_GIF || mediaKind === "GIF") {
    return "GIF";
  }
  if (mediaKind === "LOGO") return "LOGO";
  return "IMAGE";
}

async function loadDocumentOrThrow(
  sb: SupabaseClient,
  documentId: string,
): Promise<DocRow> {
  const { data, error } = await sb
    .from("app_intro_documents")
    .select("document_id,draft_version,document")
    .eq("document_id", documentId)
    .maybeSingle();
  if (error) throw new Error(`document_load_failed:${error.message}`);
  if (!data) throw new PublishNotFoundError();
  return data as DocRow;
}

async function captureReadyPins(
  sb: SupabaseClient,
  document: IntroDocumentV1,
): Promise<CapturedRuntimeMediaPinV1[]> {
  const mediaRefIds = collectAuthoredMediaRefIds(document);
  const pins: CapturedRuntimeMediaPinV1[] = [];

  for (const mediaRefId of mediaRefIds) {
    const { data: media, error } = await sb
      .from("app_intro_media")
      .select(
        "media_id,media_kind,status,mime,current_runtime_artifact_id,deleted_at",
      )
      .eq("media_id", mediaRefId)
      .maybeSingle();
    if (error) throw new Error(`media_load_failed:${error.message}`);
    const row = media as MediaRow | null;
    if (!row || row.deleted_at) {
      throw new PublishValidationError([
        {
          code: "UNKNOWN_MEDIA_REF",
          severity: "error",
          path: `mediaRefId:${mediaRefId}`,
          message: "unknown mediaRefId",
        },
      ]);
    }
    if (row.status !== AppIntroMediaLifecycleState.READY) {
      throw new PublishValidationError([
        {
          code: "MEDIA_NOT_READY",
          severity: "error",
          path: `mediaRefId:${mediaRefId}`,
          message: `media status ${row.status} is not READY`,
        },
      ]);
    }
    if (!row.current_runtime_artifact_id) {
      throw new PublishValidationError([
        {
          code: "MEDIA_NOT_READY",
          severity: "error",
          path: `mediaRefId:${mediaRefId}`,
          message: "READY media missing runtimeArtifactId",
        },
      ]);
    }
    const { data: rt, error: rtErr } = await sb
      .from("app_intro_runtime_artifacts")
      .select("*")
      .eq("runtime_artifact_id", row.current_runtime_artifact_id)
      .maybeSingle();
    if (rtErr || !rt) {
      throw new PublishValidationError([
        {
          code: "MEDIA_NOT_READY",
          severity: "error",
          path: `mediaRefId:${mediaRefId}`,
          message: "runtime artifact missing",
        },
      ]);
    }
    const runtime = rt as RuntimeRow;
    pins.push({
      mediaRefId,
      mediaId: row.media_id,
      runtimeArtifactId: runtime.runtime_artifact_id,
      runtimeIntegrity: runtime.integrity,
      format: runtime.format,
      mime: row.mime ?? mimeForPin({
        mediaRefId,
        mediaId: row.media_id,
        runtimeArtifactId: runtime.runtime_artifact_id,
        runtimeIntegrity: runtime.integrity,
        format: runtime.format,
        mime: row.mime ?? "",
        width: runtime.width,
        height: runtime.height,
        byteLength: runtime.byte_length,
        storageBucket: runtime.storage_bucket,
        storagePath: runtime.storage_path,
        animationMetadata: runtime.animation_metadata,
        kind: kindForPin(row.media_kind, runtime.format),
      }),
      width: runtime.width,
      height: runtime.height,
      byteLength: Number(runtime.byte_length),
      storageBucket: runtime.storage_bucket,
      storagePath: runtime.storage_path,
      animationMetadata: runtime.animation_metadata,
      kind: kindForPin(row.media_kind, runtime.format),
    });
  }
  return pins;
}

async function downloadExactBytes(
  sb: SupabaseClient,
  bucket: string,
  path: string,
  expectedIntegrity: string,
  expectedByteLength: number,
): Promise<Buffer> {
  const { data, error } = await sb.storage.from(bucket).download(path);
  if (error || !data) {
    throw new Error(`storage_download_failed:${path}:${error?.message ?? "missing"}`);
  }
  const bytes = Buffer.from(await data.arrayBuffer());
  if (bytes.byteLength !== expectedByteLength) {
    throw new Error(
      `byte_length_mismatch:${path}:expected=${expectedByteLength}:actual=${bytes.byteLength}`,
    );
  }
  if (!integrityMatches(expectedIntegrity, bytes)) {
    throw new Error(`integrity_mismatch:${path}`);
  }
  return bytes;
}

async function uploadImmutable(
  sb: SupabaseClient,
  path: string,
  bytes: Buffer,
  contentType: string,
): Promise<void> {
  const { error } = await sb.storage.from(APP_INTRO_STORAGE_BUCKET).upload(path, bytes, {
    contentType,
    upsert: false,
  });
  if (error) {
    // Safe reuse: if object already exists with same bytes, allow resume.
    const { data: existing } = await sb.storage
      .from(APP_INTRO_STORAGE_BUCKET)
      .download(path);
    if (!existing) {
      throw new Error(`storage_upload_failed:${path}:${error.message}`);
    }
    const existingBytes = Buffer.from(await existing.arrayBuffer());
    if (!existingBytes.equals(bytes)) {
      throw new PublishSealCollisionError(
        `HARD_COLLISION path=${path} existing integrity mismatch`,
      );
    }
    return;
  }
}

async function markOpFailed(
  sb: SupabaseClient,
  publishOperationId: string,
  code: string,
  message: string,
): Promise<void> {
  await sb
    .from("app_intro_publish_operations")
    .update({
      status: AppIntroPublishOpStatus.FAILED,
      failure_code: code,
      failure_message: message,
      updated_at: nowIso(),
    })
    .eq("publish_operation_id", publishOperationId)
    .in("status", [
      AppIntroPublishOpStatus.PREPARING,
      AppIntroPublishOpStatus.READY_TO_COMMIT,
    ]);
  await sb
    .from("app_intro_revisions")
    .update({ publish_state: AppIntroPublishOpStatus.FAILED })
    .eq("publish_operation_id", publishOperationId)
    .neq("publish_state", AppIntroPublishOpStatus.COMMITTED);
}

export type PublishResult = {
  ok: true;
  publishOperationId: string;
  publishedRevisionId: string;
  packId: string;
  documentId: string;
  sourceDraftVersion: number;
  documentIntegrity: string;
  packIntegrity: string;
  assetSetIntegrity: string;
  packStoragePath: string;
  status: "COMMITTED";
  resumed: boolean;
  identityTrace: {
    documentId: string;
    sourceDraftVersion: number;
    publishOperationId: string;
    publishedRevisionId: string;
    documentIntegrity: string;
    media: Array<{
      mediaRefId: string;
      mediaId: string;
      runtimeArtifactId: string;
      runtimeIntegrity: string;
      sealedAssetId: string;
      sealedIntegrity: string;
    }>;
    packId: string;
    packIntegrity: string;
    packStoragePath: string;
  };
  packSummary: Record<string, unknown>;
  nativeConsumability: ReturnType<typeof auditNativeConsumability>;
  liveKind: string;
};

async function loadCommittedResult(
  sb: SupabaseClient,
  op: PublishOpRow,
  resumed: boolean,
): Promise<PublishResult> {
  const { data: rev } = await sb
    .from("app_intro_revisions")
    .select("*")
    .eq("publish_operation_id", op.publish_operation_id)
    .maybeSingle();
  if (!rev || (rev as RevisionRow).publish_state !== AppIntroPublishOpStatus.COMMITTED) {
    throw new Error("COMMITTED_OP_MISSING_REVISION");
  }
  const revision = rev as RevisionRow;
  if (!revision.pack_id) throw new Error("COMMITTED_REVISION_MISSING_PACK");
  const { data: packRow } = await sb
    .from("app_intro_packs")
    .select("*")
    .eq("pack_id", revision.pack_id)
    .maybeSingle();
  if (!packRow) throw new Error("COMMITTED_PACK_MISSING");

  const { data: sealedRows } = await sb
    .from("app_intro_sealed_assets")
    .select("*")
    .eq("published_revision_id", revision.published_revision_id);

  const packPath = packRow.storage_path as string;
  const { data: packBlob } = await sb.storage
    .from(APP_INTRO_STORAGE_BUCKET)
    .download(packPath);
  if (!packBlob) throw new Error("PACK_OBJECT_MISSING");
  const packJson = JSON.parse(
    Buffer.from(await packBlob.arrayBuffer()).toString("utf8"),
  ) as IntroPackV1;

  const { data: live } = await sb
    .from("app_intro_live")
    .select("live_kind")
    .eq("singleton", true)
    .maybeSingle();

  const mediaTrace = (sealedRows ?? []).map((s) => ({
    mediaRefId: String(s.media_ref_id ?? ""),
    mediaId: String(s.media_id ?? ""),
    runtimeArtifactId: String(s.runtime_artifact_id ?? ""),
    runtimeIntegrity:
      (op.captured_runtime_set.find(
        (p) => p.mediaRefId === s.media_ref_id,
      )?.runtimeIntegrity as string) ?? "",
    sealedAssetId: String(s.sealed_asset_id),
    sealedIntegrity: String(s.integrity),
  }));

  return {
    ok: true,
    publishOperationId: op.publish_operation_id,
    publishedRevisionId: revision.published_revision_id,
    packId: revision.pack_id,
    documentId: op.document_id,
    sourceDraftVersion: op.source_draft_version,
    documentIntegrity: revision.document_integrity,
    packIntegrity: String(packRow.manifest_integrity),
    assetSetIntegrity: String(packRow.asset_set_integrity),
    packStoragePath: packPath,
    status: "COMMITTED",
    resumed,
    identityTrace: {
      documentId: op.document_id,
      sourceDraftVersion: op.source_draft_version,
      publishOperationId: op.publish_operation_id,
      publishedRevisionId: revision.published_revision_id,
      documentIntegrity: revision.document_integrity,
      media: mediaTrace,
      packId: revision.pack_id,
      packIntegrity: String(packRow.manifest_integrity),
      packStoragePath: packPath,
    },
    packSummary: packSummaryForReport(packJson),
    nativeConsumability: auditNativeConsumability(packJson),
    liveKind: String(live?.live_kind ?? AppIntroLiveKind.NEVER_CONFIGURED),
  };
}

/**
 * Execute or resume Publish for a real Admin document.
 * Does NOT Set Live. Does NOT mutate app_intro_live.
 */
export async function publishIntroDocument(args: {
  sb: SupabaseClient;
  userId: string;
  documentId: string;
  sourceDraftVersion: number;
  idempotencyKey: string;
}): Promise<PublishResult> {
  const { sb, userId, documentId, sourceDraftVersion, idempotencyKey } = args;
  if (!idempotencyKey || idempotencyKey.length < 8) {
    throw new PublishConflictError("INVALID_IDEMPOTENCY_KEY");
  }
  if (!Number.isInteger(sourceDraftVersion) || sourceDraftVersion < 1) {
    throw new PublishConflictError("INVALID_SOURCE_DRAFT_VERSION");
  }

  // Idempotency lookup first
  const { data: existingOp } = await sb
    .from("app_intro_publish_operations")
    .select("*")
    .eq("document_id", documentId)
    .eq("source_draft_version", sourceDraftVersion)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (existingOp) {
    const op = existingOp as PublishOpRow;
    if (op.status === AppIntroPublishOpStatus.COMMITTED) {
      return loadCommittedResult(sb, op, true);
    }
    if (op.status === AppIntroPublishOpStatus.FAILED) {
      throw new PublishFailedOpError({
        publishOperationId: op.publish_operation_id,
        failureCode: op.failure_code,
        failureMessage: op.failure_message,
      });
    }
    // PREPARING / READY_TO_COMMIT → resume with captured snapshot (not latest draft)
    return resumePublish(sb, userId, op, true);
  }

  // Fresh prepare: load current draft and require version match
  const docRow = await loadDocumentOrThrow(sb, documentId);
  if (docRow.draft_version !== sourceDraftVersion) {
    throw new PublishConflictError(
      "DRAFT_VERSION_MISMATCH",
      `expected sourceDraftVersion=${sourceDraftVersion} actual=${docRow.draft_version}`,
    );
  }

  const capturedDocument = canonicalizeAuthoredDocument(
    docRow.document as IntroDocumentV1,
  );

  // Capture READY pins ONCE before validation commit path
  let capturedPins: CapturedRuntimeMediaPinV1[];
  try {
    capturedPins = await captureReadyPins(sb, capturedDocument);
  } catch (err) {
    if (err instanceof PublishValidationError) throw err;
    throw err;
  }

  const readySet = new Set(capturedPins.map((p) => p.mediaRefId));
  const validation = validatePublish(capturedDocument, {
    isMediaReady: (id) => readySet.has(id),
  });
  if (!validation.ok) {
    throw new PublishValidationError(validation.issues);
  }

  const publishOperationId = randomUUID();
  const { error: opInsErr } = await sb.from("app_intro_publish_operations").insert({
    publish_operation_id: publishOperationId,
    document_id: documentId,
    source_draft_version: sourceDraftVersion,
    idempotency_key: idempotencyKey,
    status: AppIntroPublishOpStatus.PREPARING,
    captured_document: capturedDocument,
    captured_runtime_set: capturedPins,
    created_by: userId,
    updated_at: nowIso(),
  });
  if (opInsErr) {
    // Race: another insert won — reload and follow idempotency rules
    const { data: raced } = await sb
      .from("app_intro_publish_operations")
      .select("*")
      .eq("document_id", documentId)
      .eq("source_draft_version", sourceDraftVersion)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (raced) {
      const op = raced as PublishOpRow;
      if (op.status === AppIntroPublishOpStatus.COMMITTED) {
        return loadCommittedResult(sb, op, true);
      }
      if (op.status === AppIntroPublishOpStatus.FAILED) {
        throw new PublishFailedOpError({
          publishOperationId: op.publish_operation_id,
          failureCode: op.failure_code,
          failureMessage: op.failure_message,
        });
      }
      return resumePublish(sb, userId, op, true);
    }
    throw new Error(`publish_op_insert_failed:${opInsErr.message}`);
  }

  const op: PublishOpRow = {
    publish_operation_id: publishOperationId,
    document_id: documentId,
    source_draft_version: sourceDraftVersion,
    idempotency_key: idempotencyKey,
    status: AppIntroPublishOpStatus.PREPARING,
    captured_document: capturedDocument,
    captured_runtime_set: capturedPins,
    failure_code: null,
    failure_message: null,
  };
  return resumePublish(sb, userId, op, false);
}

async function resumePublish(
  sb: SupabaseClient,
  userId: string,
  op: PublishOpRow,
  resumed: boolean,
): Promise<PublishResult> {
  const capturedDocument = canonicalizeAuthoredDocument(op.captured_document);
  const capturedPins = op.captured_runtime_set ?? [];
  const documentIntegrity = documentDigestOf(capturedDocument);

  // Ensure revision row exists (PREPARING)
  let { data: rev } = await sb
    .from("app_intro_revisions")
    .select("*")
    .eq("publish_operation_id", op.publish_operation_id)
    .maybeSingle();

  if (!rev) {
    const publishedRevisionId = randomUUID();
    const { error: revErr } = await sb.from("app_intro_revisions").insert({
      published_revision_id: publishedRevisionId,
      document_id: op.document_id,
      publish_operation_id: op.publish_operation_id,
      source_draft_version: op.source_draft_version,
      publish_state: AppIntroPublishOpStatus.PREPARING,
      document_snapshot: capturedDocument,
      document_integrity: documentIntegrity,
      schema_version: INTRO_PACK_SCHEMA_VERSION,
      protocol_version: INTRO_PROTOCOL_VERSION,
      render_spec_version: INTRO_RENDER_SPEC_VERSION,
      font_spec_version: INTRO_FONT_SPEC_VERSION,
      authority_generation: INTRO_AUTHORITY_GENERATION,
      created_by: userId,
    });
    if (revErr) {
      await markOpFailed(sb, op.publish_operation_id, "REVISION_INSERT_FAILED", revErr.message);
      throw new Error(`revision_insert_failed:${revErr.message}`);
    }
    const { data: again } = await sb
      .from("app_intro_revisions")
      .select("*")
      .eq("publish_operation_id", op.publish_operation_id)
      .maybeSingle();
    rev = again;
  }

  const revision = rev as RevisionRow;
  if (revision.publish_state === AppIntroPublishOpStatus.COMMITTED) {
    return loadCommittedResult(sb, { ...op, status: AppIntroPublishOpStatus.COMMITTED }, resumed);
  }

  try {
    // Seal each captured pin (exact READY bytes — no re-encode)
    const sealedEntries: IntroPackAssetEntryV1[] = [];
    for (const pin of capturedPins) {
      const sealed = await sealOneAsset(sb, revision.published_revision_id, pin);
      sealedEntries.push(sealed);
    }

    // READY_TO_COMMIT after all seals
    await sb
      .from("app_intro_publish_operations")
      .update({
        status: AppIntroPublishOpStatus.READY_TO_COMMIT,
        updated_at: nowIso(),
      })
      .eq("publish_operation_id", op.publish_operation_id)
      .eq("status", AppIntroPublishOpStatus.PREPARING);

    await sb
      .from("app_intro_revisions")
      .update({ publish_state: AppIntroPublishOpStatus.READY_TO_COMMIT })
      .eq("published_revision_id", revision.published_revision_id)
      .eq("publish_state", AppIntroPublishOpStatus.PREPARING);

    // Pack build
    let packId = revision.pack_id;
    const { data: existingPack } = await sb
      .from("app_intro_packs")
      .select("*")
      .eq("published_revision_id", revision.published_revision_id)
      .maybeSingle();

    let pack: IntroPackV1;
    let packStoragePath: string;

    if (existingPack) {
      packId = existingPack.pack_id as string;
      packStoragePath = existingPack.storage_path as string;
      const { data: blob } = await sb.storage
        .from(APP_INTRO_STORAGE_BUCKET)
        .download(packStoragePath);
      if (!blob) throw new Error("EXISTING_PACK_OBJECT_MISSING");
      pack = JSON.parse(
        Buffer.from(await blob.arrayBuffer()).toString("utf8"),
      ) as IntroPackV1;
    } else {
      packId = randomUUID();
      // Write pack asset bytes (exact sealed copies)
      for (const entry of sealedEntries) {
        const pin = capturedPins.find((p) => p.mediaRefId === entry.mediaRefId)!;
        const sealedPath = buildSealedStoragePath({
          publishedRevisionId: revision.published_revision_id,
          sealedAssetId: entry.sealedAssetId,
          ext: extForFormat(pin.format, mimeForPin(pin)),
        });
        const bytes = await downloadExactBytes(
          sb,
          APP_INTRO_STORAGE_BUCKET,
          sealedPath,
          entry.sealedIntegrity,
          entry.byteLength,
        );
        const packAssetPath = buildPackAssetStoragePath({
          packId,
          sealedAssetId: entry.sealedAssetId,
          ext: extForFormat(pin.format, mimeForPin(pin)),
        });
        assertPackPath(packAssetPath);
        await uploadImmutable(sb, packAssetPath, bytes, mimeForPin(pin));
      }

      pack = buildIntroPackV1({
        packId,
        publishedRevisionId: revision.published_revision_id,
        documentId: op.document_id,
        sourceDraftVersion: op.source_draft_version,
        document: capturedDocument,
        assets: sealedEntries,
      });

      const consumability = auditNativeConsumability(pack);
      if (!consumability.ok) {
        throw new Error(
          `NATIVE_CONSUMABILITY_FAIL:${JSON.stringify(consumability)}`,
        );
      }

      packStoragePath = buildPackManifestStoragePath(packId);
      assertPackPath(packStoragePath);
      const packBytes = Buffer.from(JSON.stringify(pack), "utf8");
      await uploadImmutable(sb, packStoragePath, packBytes, "application/json");

      const { error: packInsErr } = await sb.from("app_intro_packs").insert({
        pack_id: packId,
        published_revision_id: revision.published_revision_id,
        manifest_integrity: pack.packIntegrity,
        document_integrity: pack.documentIntegrity.documentDigest,
        asset_set_integrity: pack.assetSetIntegrity,
        schema_version: INTRO_PACK_SCHEMA_VERSION,
        protocol_version: INTRO_PROTOCOL_VERSION,
        render_spec_version: INTRO_RENDER_SPEC_VERSION,
        font_spec_version: INTRO_FONT_SPEC_VERSION,
        storage_bucket: APP_INTRO_STORAGE_BUCKET,
        storage_path: packStoragePath,
      });
      if (packInsErr) {
        throw new Error(`pack_insert_failed:${packInsErr.message}`);
      }
    }

    // Atomic authority commit: revision → COMMITTED, op → COMMITTED
    const { error: commitRevErr } = await sb
      .from("app_intro_revisions")
      .update({
        publish_state: AppIntroPublishOpStatus.COMMITTED,
        pack_id: packId,
        manifest_integrity: pack.packIntegrity,
        asset_set_integrity: pack.assetSetIntegrity,
      })
      .eq("published_revision_id", revision.published_revision_id)
      .neq("publish_state", AppIntroPublishOpStatus.COMMITTED);
    if (commitRevErr) {
      throw new Error(`revision_commit_failed:${commitRevErr.message}`);
    }

    const { error: commitOpErr } = await sb
      .from("app_intro_publish_operations")
      .update({
        status: AppIntroPublishOpStatus.COMMITTED,
        updated_at: nowIso(),
      })
      .eq("publish_operation_id", op.publish_operation_id)
      .neq("status", AppIntroPublishOpStatus.COMMITTED);
    if (commitOpErr) {
      throw new Error(`op_commit_failed:${commitOpErr.message}`);
    }

    // Prove Live remains inert (read-only check — never write)
    const { data: live } = await sb
      .from("app_intro_live")
      .select("live_kind")
      .eq("singleton", true)
      .maybeSingle();
    const liveKind = String(live?.live_kind ?? AppIntroLiveKind.NEVER_CONFIGURED);
    if (liveKind === AppIntroLiveKind.COMMITTED_LIVE) {
      // V1 must not create Live; if already live from elsewhere, still do not mutate.
    }

    return loadCommittedResult(
      sb,
      { ...op, status: AppIntroPublishOpStatus.COMMITTED },
      resumed,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "publish_failed";
    const code =
      err instanceof PublishSealCollisionError
        ? "SEAL_COLLISION"
        : err instanceof PublishValidationError
          ? "VALIDATION"
          : "PUBLISH_FAILED";
    await markOpFailed(sb, op.publish_operation_id, code, message);
    throw err;
  }
}

async function sealOneAsset(
  sb: SupabaseClient,
  publishedRevisionId: string,
  pin: CapturedRuntimeMediaPinV1,
): Promise<IntroPackAssetEntryV1> {
  // Resume: existing sealed row for this revision+runtime?
  const { data: existing } = await sb
    .from("app_intro_sealed_assets")
    .select("*")
    .eq("published_revision_id", publishedRevisionId)
    .eq("runtime_artifact_id", pin.runtimeArtifactId)
    .maybeSingle();

  if (existing) {
    if (existing.integrity !== pin.runtimeIntegrity) {
      throw new PublishSealCollisionError(
        `sealed integrity mismatch for runtime ${pin.runtimeArtifactId}`,
      );
    }
    const ext = extForFormat(pin.format, mimeForPin(pin));
    return {
      sealedAssetId: existing.sealed_asset_id as string,
      mediaRefId: pin.mediaRefId,
      mediaId: pin.mediaId,
      runtimeArtifactId: pin.runtimeArtifactId,
      runtimeIntegrity: pin.runtimeIntegrity,
      sealedIntegrity: existing.integrity as string,
      kind: pin.kind,
      format: pin.format,
      mime: mimeForPin(pin),
      width: Number(existing.width),
      height: Number(existing.height),
      byteLength: Number(existing.byte_length),
      relativePackPath: packRelativeAssetPath({
        sealedAssetId: existing.sealed_asset_id as string,
        ext,
      }),
      animationMetadata: (existing.animation_metadata as Record<
        string,
        unknown
      > | null) ?? pin.animationMetadata,
    };
  }

  // Download exact READY runtime bytes — NO re-encode
  const bytes = await downloadExactBytes(
    sb,
    pin.storageBucket,
    pin.storagePath,
    pin.runtimeIntegrity,
    pin.byteLength,
  );
  // GIF Gate C-R1: sealed bytes must equal READY bytes exactly
  const sealedIntegrity = integrityOf(bytes);
  if (sealedIntegrity !== pin.runtimeIntegrity) {
    throw new Error(
      `seal_integrity_drift runtime=${pin.runtimeIntegrity} sealed=${sealedIntegrity}`,
    );
  }

  const sealedAssetId = randomUUID();
  const ext = extForFormat(pin.format, mimeForPin(pin));
  const storagePath = buildSealedStoragePath({
    publishedRevisionId,
    sealedAssetId,
    ext,
  });
  assertSealedPath(storagePath);
  await uploadImmutable(sb, storagePath, bytes, mimeForPin(pin));

  // Verify after seal
  const verify = await downloadExactBytes(
    sb,
    APP_INTRO_STORAGE_BUCKET,
    storagePath,
    sealedIntegrity,
    bytes.byteLength,
  );
  if (!verify.equals(bytes)) {
    throw new Error("sealed_bytes_not_equal_to_runtime");
  }

  const { error: sealInsErr } = await sb.from("app_intro_sealed_assets").insert({
    sealed_asset_id: sealedAssetId,
    published_revision_id: publishedRevisionId,
    runtime_artifact_id: pin.runtimeArtifactId,
    media_id: pin.mediaId,
    media_ref_id: pin.mediaRefId,
    format: pin.format,
    width: pin.width,
    height: pin.height,
    byte_length: pin.byteLength,
    integrity: sealedIntegrity,
    storage_bucket: APP_INTRO_STORAGE_BUCKET,
    storage_path: storagePath,
    animation_metadata: pin.animationMetadata,
  });
  if (sealInsErr) {
    // Path unique collision with mismatching integrity = HARD FAIL
    if (sealInsErr.message.includes("app_intro_sealed_assets_path_uidx")) {
      throw new PublishSealCollisionError(
        `HARD_COLLISION sealed path ${storagePath}`,
      );
    }
    throw new Error(`sealed_insert_failed:${sealInsErr.message}`);
  }

  return {
    sealedAssetId,
    mediaRefId: pin.mediaRefId,
    mediaId: pin.mediaId,
    runtimeArtifactId: pin.runtimeArtifactId,
    runtimeIntegrity: pin.runtimeIntegrity,
    sealedIntegrity,
    kind: pin.kind,
    format: pin.format,
    mime: mimeForPin(pin),
    width: pin.width,
    height: pin.height,
    byteLength: pin.byteLength,
    relativePackPath: packRelativeAssetPath({ sealedAssetId, ext }),
    animationMetadata: pin.animationMetadata,
  };
}

/** Read-only Live inert proof for V1. */
export async function assertLiveInert(sb: SupabaseClient): Promise<{
  liveKind: string;
  inert: boolean;
}> {
  const { data } = await sb
    .from("app_intro_live")
    .select("live_kind,published_revision_id,pack_id")
    .eq("singleton", true)
    .maybeSingle();
  const liveKind = String(data?.live_kind ?? AppIntroLiveKind.NEVER_CONFIGURED);
  const inert =
    liveKind === AppIntroLiveKind.NEVER_CONFIGURED ||
    liveKind === AppIntroLiveKind.NO_LIVE_INTRO;
  return { liveKind, inert };
}
