import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { INTRO_SHOW_NAMESPACE } from "@/intro-engine/identity";
import { sha256BufferHex } from "@/lib/intro-show/hash";

const BUCKET = INTRO_SHOW_NAMESPACE.storageBucket;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

export type IntroShowMediaKind = "LOGO" | "IMAGE";

export function isAllowedIntroShowMime(mime: string): boolean {
  return ALLOWED_MIME.has(mime.toLowerCase());
}

export async function createIntroShowSignedUpload(
  sb: SupabaseClient,
  input: { campaignId: string; adminUserId: string; kind: IntroShowMediaKind; mimeType: string },
): Promise<{ mediaId: string; path: string; signedUrl: string; token: string }> {
  if (!isAllowedIntroShowMime(input.mimeType)) throw new Error("mime_not_allowed");
  const mediaId = crypto.randomUUID();
  const ext = input.mimeType === "image/png" ? "png" : input.mimeType === "image/webp" ? "webp" : "jpg";
  const path = `source/${input.campaignId}/${mediaId}.${ext}`;
  const { error: insertError } = await sb.from("intro_show_media").insert({
    id: mediaId,
    campaign_id: input.campaignId,
    kind: input.kind,
    status: "pending",
    mime_type: input.mimeType,
    source_storage_key: path,
    created_by: input.adminUserId,
  });
  if (insertError) throw new Error(insertError.message);
  const { data, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    await sb.from("intro_show_media").delete().eq("id", mediaId);
    throw new Error(error?.message ?? "sign_failed");
  }
  return { mediaId, path, signedUrl: data.signedUrl, token: data.token };
}

async function markFailed(sb: SupabaseClient, mediaId: string): Promise<void> {
  await sb.from("intro_show_media").update({ status: "failed" }).eq("id", mediaId);
}

export async function processIntroShowMedia(
  sb: SupabaseClient,
  input: { campaignId: string; mediaId: string },
): Promise<{ mediaId: string; width: number; height: number; byteSize: number }> {
  const { data: row, error } = await sb
    .from("intro_show_media")
    .select("id, campaign_id, source_storage_key, status")
    .eq("id", input.mediaId)
    .eq("campaign_id", input.campaignId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row?.source_storage_key) throw new Error("media_missing");
  if (row.status === "ready") {
    const { data: asset } = await sb
      .from("intro_show_media_assets")
      .select("width, height, byte_size")
      .eq("media_id", input.mediaId)
      .maybeSingle();
    return {
      mediaId: input.mediaId,
      width: Number(asset?.width ?? 0),
      height: Number(asset?.height ?? 0),
      byteSize: Number(asset?.byte_size ?? 0),
    };
  }

  const { data: file, error: dlError } = await sb.storage.from(BUCKET).download(String(row.source_storage_key));
  if (dlError || !file) {
    await markFailed(sb, input.mediaId);
    throw new Error(dlError?.message ?? "source_missing");
  }
  const sourceBuf = Buffer.from(await file.arrayBuffer());

  let meta: sharp.Metadata;
  try {
    meta = await sharp(sourceBuf, { failOn: "none", limitInputPixels: false }).rotate().metadata();
  } catch {
    await markFailed(sb, input.mediaId);
    throw new Error("image_unreadable");
  }
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width < 1 || height < 1) {
    await markFailed(sb, input.mediaId);
    throw new Error("image_dimensions_invalid");
  }

  const runtimeBuf = await sharp(sourceBuf, { failOn: "none", limitInputPixels: false })
    .rotate()
    .resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 86, effort: 4 })
    .toBuffer();
  const thumbBuf = await sharp(sourceBuf, { failOn: "none", limitInputPixels: false })
    .rotate()
    .resize({ width: 320, height: 320, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 72, effort: 4 })
    .toBuffer();
  const runtimeMeta = await sharp(runtimeBuf, { failOn: "none" }).metadata();
  const checksum = sha256BufferHex(runtimeBuf);
  const runtimeKey = `runtime/${input.campaignId}/${input.mediaId}.webp`;
  const thumbKey = `thumb/${input.campaignId}/${input.mediaId}.webp`;

  const { error: runtimeUp } = await sb.storage.from(BUCKET).upload(runtimeKey, runtimeBuf, {
    contentType: "image/webp",
    upsert: true,
  });
  if (runtimeUp) {
    await markFailed(sb, input.mediaId);
    throw new Error(runtimeUp.message);
  }
  const { error: thumbUp } = await sb.storage.from(BUCKET).upload(thumbKey, thumbBuf, {
    contentType: "image/webp",
    upsert: true,
  });
  if (thumbUp) {
    await markFailed(sb, input.mediaId);
    throw new Error(thumbUp.message);
  }

  const { error: mediaUp } = await sb
    .from("intro_show_media")
    .update({
      status: "ready",
      width,
      height,
      byte_size: sourceBuf.byteLength,
      checksum: sha256BufferHex(sourceBuf),
      thumbnail_storage_key: thumbKey,
    })
    .eq("id", input.mediaId);
  if (mediaUp) {
    await markFailed(sb, input.mediaId);
    throw new Error(mediaUp.message);
  }
  const { error: assetUp } = await sb.from("intro_show_media_assets").upsert({
    media_id: input.mediaId,
    runtime_storage_key: runtimeKey,
    width: runtimeMeta.width ?? width,
    height: runtimeMeta.height ?? height,
    checksum,
    byte_size: runtimeBuf.byteLength,
  });
  if (assetUp) {
    await markFailed(sb, input.mediaId);
    throw new Error(assetUp.message);
  }

  return { mediaId: input.mediaId, width, height, byteSize: sourceBuf.byteLength };
}

export async function seedDibayLogoMedia(
  sb: SupabaseClient,
  input: { campaignId: string; adminUserId: string },
): Promise<{ mediaId: string; width: number; height: number }> {
  const logoPath = join(process.cwd(), "public/images/brand/dibay-logo-mark.png");
  const sourceBuf = readFileSync(logoPath);
  const mediaId = crypto.randomUUID();
  const sourceKey = `source/${input.campaignId}/${mediaId}.png`;
  const { error: insertError } = await sb.from("intro_show_media").insert({
    id: mediaId,
    campaign_id: input.campaignId,
    kind: "LOGO",
    status: "pending",
    mime_type: "image/png",
    source_storage_key: sourceKey,
    created_by: input.adminUserId,
  });
  if (insertError) throw new Error(insertError.message);
  const { error: upError } = await sb.storage.from(BUCKET).upload(sourceKey, sourceBuf, {
    contentType: "image/png",
    upsert: true,
  });
  if (upError) {
    await markFailed(sb, mediaId);
    throw new Error(upError.message);
  }
  const processed = await processIntroShowMedia(sb, { campaignId: input.campaignId, mediaId });
  return { mediaId, width: processed.width, height: processed.height };
}

export async function readIntroShowMediaFile(
  sb: SupabaseClient,
  input: { campaignId: string; mediaId: string; variant: "thumb" | "runtime" | "source" },
): Promise<{ buf: Buffer; contentType: string } | null> {
  const { data: row } = await sb
    .from("intro_show_media")
    .select("source_storage_key, thumbnail_storage_key")
    .eq("id", input.mediaId)
    .eq("campaign_id", input.campaignId)
    .maybeSingle();
  if (!row) return null;
  let key: string | null = null;
  if (input.variant === "source") key = row.source_storage_key ? String(row.source_storage_key) : null;
  if (input.variant === "thumb") key = row.thumbnail_storage_key ? String(row.thumbnail_storage_key) : null;
  if (input.variant === "runtime") {
    const { data: asset } = await sb
      .from("intro_show_media_assets")
      .select("runtime_storage_key")
      .eq("media_id", input.mediaId)
      .maybeSingle();
    key = asset?.runtime_storage_key ? String(asset.runtime_storage_key) : null;
  }
  if (!key) return null;
  const { data: file, error } = await sb.storage.from(BUCKET).download(key);
  if (error || !file) return null;
  const buf = Buffer.from(await file.arrayBuffer());
  const contentType = input.variant === "source" ? "application/octet-stream" : "image/webp";
  return { buf, contentType };
}
