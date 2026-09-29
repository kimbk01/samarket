import type { SupabaseClient } from "@supabase/supabase-js";
import {
  INTRO13_PROTOCOL_VERSION,
  INTRO13_RENDER_SPEC_VERSION,
  INTRO13_SCHEMA_VERSION,
  collectDocumentMediaIds,
  type IntroDocumentV1,
  type IntroRuntimePackageV1,
  validateDocumentV0,
} from "@/lib/intro/contracts/document";
import { integrityOfCanonicalJson } from "@/lib/intro/integrity";
import { getIntroDocument } from "@/lib/intro/document/service";
import { getReadyRuntimeForMedia } from "@/lib/intro/media/service";
import { integrityOf } from "@/lib/intro/media/integrity";
import { APP_INTRO_STORAGE_BUCKET } from "@/lib/intro/db/authority";

const BUCKET = APP_INTRO_STORAGE_BUCKET;

export type PublishResult = {
  releaseId: string;
  packageId: string;
  packageIntegrity: string;
  storagePath: string;
};

export function buildRuntimePackage(args: {
  releaseId: string;
  packageId: string;
  document: IntroDocumentV1;
  assets?: IntroRuntimePackageV1["assets"];
}): IntroRuntimePackageV1 {
  const withoutIntegrity: Omit<IntroRuntimePackageV1, "packageIntegrity"> = {
    schemaVersion: INTRO13_SCHEMA_VERSION,
    protocolVersion: INTRO13_PROTOCOL_VERSION,
    renderSpecVersion: INTRO13_RENDER_SPEC_VERSION,
    packageId: args.packageId,
    releaseId: args.releaseId,
    compositionAspect: args.document.compositionAspect,
    scenes: args.document.scenes,
    assets: args.assets ?? {},
  };
  const packageIntegrity = integrityOfCanonicalJson(withoutIntegrity);
  return { ...withoutIntegrity, packageIntegrity };
}

export async function publishIntroDocument(
  sb: SupabaseClient,
  args: { documentId: string; userId: string; idempotencyKey: string },
): Promise<PublishResult> {
  const row = await getIntroDocument(sb, args.documentId);
  if (!row) throw new Error("document_not_found");
  const document = row.document as IntroDocumentV1;
  const invalid = validateDocumentV0(document);
  if (invalid) throw new Error(`invalid_document:${invalid}`);

  const { data: existingOp } = await sb
    .from("app_intro_publish_operations")
    .select("publish_operation_id, status")
    .eq("document_id", args.documentId)
    .eq("source_draft_version", row.draft_version)
    .eq("idempotency_key", args.idempotencyKey)
    .maybeSingle();

  if (existingOp?.status === "COMMITTED") {
    const { data: rev } = await sb
      .from("app_intro_revisions")
      .select("published_revision_id, pack_id, manifest_integrity")
      .eq("publish_operation_id", existingOp.publish_operation_id)
      .maybeSingle();
    if (rev?.pack_id && rev.manifest_integrity) {
      const { data: pack } = await sb
        .from("app_intro_packs")
        .select("storage_path")
        .eq("pack_id", rev.pack_id)
        .maybeSingle();
      return {
        releaseId: rev.published_revision_id,
        packageId: rev.pack_id,
        packageIntegrity: rev.manifest_integrity,
        storagePath: pack?.storage_path ?? "",
      };
    }
  }

  const mediaIds = collectDocumentMediaIds(document);
  const packageId = crypto.randomUUID();
  const assets: Record<
    string,
    {
      relativePath: string;
      integrity: string;
      width: number;
      height: number;
      format: string;
    }
  > = {};
  const sealRows: Array<{
    mediaId: string;
    sealedAssetId: string;
    runtimeArtifactId: string;
    byteLength: number;
    sealedPath: string;
  }> = [];

  for (const mediaId of mediaIds) {
    const runtime = await getReadyRuntimeForMedia(sb, mediaId);
    if (!runtime) throw new Error(`media_not_ready:${mediaId}`);
    const relativePath = `assets/${mediaId}.${runtime.ext}`;
    const sealedPath = `authority/v1/packs/${packageId}/${relativePath}`;
    const { error: sealUpErr } = await sb.storage.from(BUCKET).upload(sealedPath, runtime.bytes, {
      contentType: runtime.mime || "application/octet-stream",
      upsert: false,
    });
    if (sealUpErr) throw new Error(`seal_upload:${sealUpErr.message}`);
    const { data: verifyBlob, error: verifyErr } = await sb.storage
      .from(BUCKET)
      .download(sealedPath);
    if (verifyErr || !verifyBlob) {
      throw new Error(`seal_verify_download:${verifyErr?.message ?? "missing"}`);
    }
    const verifyBuf = Buffer.from(await verifyBlob.arrayBuffer());
    if (integrityOf(verifyBuf) !== runtime.integrity) {
      throw new Error(`seal_verify_integrity:${mediaId}`);
    }
    assets[mediaId] = {
      relativePath,
      integrity: runtime.integrity,
      width: runtime.width,
      height: runtime.height,
      format: runtime.format,
    };
    sealRows.push({
      mediaId,
      sealedAssetId: crypto.randomUUID(),
      runtimeArtifactId: runtime.runtimeArtifactId,
      byteLength: runtime.bytes.byteLength,
      sealedPath,
    });
  }

  const documentIntegrity = integrityOfCanonicalJson(document);

  const { data: op, error: opErr } = await sb
    .from("app_intro_publish_operations")
    .insert({
      document_id: args.documentId,
      source_draft_version: row.draft_version,
      idempotency_key: args.idempotencyKey,
      status: "PREPARING",
      captured_document: document,
      captured_runtime_set: mediaIds,
      created_by: args.userId,
    })
    .select("publish_operation_id")
    .single();
  if (opErr) throw new Error(opErr.message);

  const { data: rev, error: revErr } = await sb
    .from("app_intro_revisions")
    .insert({
      document_id: args.documentId,
      publish_operation_id: op.publish_operation_id,
      source_draft_version: row.draft_version,
      publish_state: "PREPARING",
      document_snapshot: document,
      document_integrity: documentIntegrity,
      schema_version: INTRO13_SCHEMA_VERSION,
      protocol_version: INTRO13_PROTOCOL_VERSION,
      render_spec_version: INTRO13_RENDER_SPEC_VERSION,
      font_spec_version: 1,
      authority_generation: 1,
      created_by: args.userId,
    })
    .select("published_revision_id")
    .single();
  if (revErr) throw new Error(revErr.message);

  for (const seal of sealRows) {
    const asset = assets[seal.mediaId];
    if (!asset) continue;
    const { error: sealedErr } = await sb.from("app_intro_sealed_assets").insert({
      sealed_asset_id: seal.sealedAssetId,
      published_revision_id: rev.published_revision_id,
      runtime_artifact_id: seal.runtimeArtifactId,
      media_id: seal.mediaId,
      media_ref_id: seal.mediaId,
      format: asset.format,
      width: asset.width,
      height: asset.height,
      byte_length: seal.byteLength,
      integrity: asset.integrity,
      storage_bucket: BUCKET,
      storage_path: seal.sealedPath,
    });
    if (sealedErr) throw new Error(sealedErr.message);
  }

  const runtime = buildRuntimePackage({
    releaseId: rev.published_revision_id,
    packageId,
    document,
    assets,
  });

  const storagePath = `authority/v1/packs/${packageId}/pack.json`;
  const packBytes = Buffer.from(JSON.stringify(runtime), "utf8");
  const { error: upErr } = await sb.storage.from(BUCKET).upload(storagePath, packBytes, {
    contentType: "application/json",
    upsert: false,
  });
  if (upErr) throw new Error(`storage_upload:${upErr.message}`);

  const assetSetIntegrity = integrityOfCanonicalJson(assets);
  const { error: packErr } = await sb.from("app_intro_packs").insert({
    pack_id: packageId,
    published_revision_id: rev.published_revision_id,
    manifest_integrity: runtime.packageIntegrity,
    document_integrity: documentIntegrity,
    asset_set_integrity: assetSetIntegrity,
    schema_version: INTRO13_SCHEMA_VERSION,
    protocol_version: INTRO13_PROTOCOL_VERSION,
    render_spec_version: INTRO13_RENDER_SPEC_VERSION,
    font_spec_version: 1,
    storage_bucket: BUCKET,
    storage_path: storagePath,
  });
  if (packErr) throw new Error(packErr.message);

  const { error: revUpErr } = await sb
    .from("app_intro_revisions")
    .update({
      publish_state: "COMMITTED",
      pack_id: packageId,
      manifest_integrity: runtime.packageIntegrity,
      asset_set_integrity: assetSetIntegrity,
    })
    .eq("published_revision_id", rev.published_revision_id);
  if (revUpErr) throw new Error(revUpErr.message);

  const { error: opUpErr } = await sb
    .from("app_intro_publish_operations")
    .update({ status: "COMMITTED", updated_at: new Date().toISOString() })
    .eq("publish_operation_id", op.publish_operation_id);
  if (opUpErr) throw new Error(opUpErr.message);

  return {
    releaseId: rev.published_revision_id,
    packageId,
    packageIntegrity: runtime.packageIntegrity,
    storagePath,
  };
}
