import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { sha256Bytes } from "@/lib/dibay-intro/checksum";
import {
  DIBAY_INTRO_ALLOWED_MIME,
  processIntroMediaBytes,
  type DibayIntroAllowedMime,
} from "@/lib/dibay-intro/media-process";

export const DIBAY_INTRO_MEDIA_BUCKET = "dibay-intro";
export const DIBAY_INTRO_MEDIA_MAX_BYTES = 50 * 1024 * 1024;

export { DIBAY_INTRO_ALLOWED_MIME, type DibayIntroAllowedMime };

export type DibayIntroMediaRecord = {
  id: string;
  introId: string;
  originalName: string;
  mime: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  status: "uploading" | "processing" | "ready" | "failed";
  animated: boolean;
  signedUrl: string | null;
};

function svc() {
  const client = tryCreateSupabaseServiceClient();
  if (!client) throw new Error("service_unavailable");
  return client;
}

function isAllowedMime(value: string): value is DibayIntroAllowedMime {
  return value in DIBAY_INTRO_ALLOWED_MIME;
}

function mapRow(row: Record<string, unknown>, signedUrl: string | null): DibayIntroMediaRecord {
  return {
    id: String(row.id),
    introId: String(row.intro_id),
    originalName: String(row.original_name ?? ""),
    mime: String(row.mime),
    byteSize: Number(row.byte_size ?? 0),
    width: row.width == null ? null : Number(row.width),
    height: row.height == null ? null : Number(row.height),
    status: row.status as DibayIntroMediaRecord["status"],
    animated: Boolean(row.animated),
    signedUrl,
  };
}

export async function listDibayIntroMedia(introId: string): Promise<DibayIntroMediaRecord[]> {
  const db = svc();
  const { data, error } = await db
    .from("dibay_intro_media")
    .select("id,intro_id,original_name,mime,byte_size,width,height,status,animated,runtime_path")
    .eq("intro_id", introId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const out: DibayIntroMediaRecord[] = [];
  for (const row of data ?? []) {
    const runtimePath = typeof row.runtime_path === "string" ? row.runtime_path : null;
    let signedUrl: string | null = null;
    if (row.status === "ready" && runtimePath) {
      const signed = await db.storage.from(DIBAY_INTRO_MEDIA_BUCKET).createSignedUrl(runtimePath, 3600);
      signedUrl = signed.data?.signedUrl ?? null;
    }
    out.push(mapRow(row as Record<string, unknown>, signedUrl));
  }
  return out;
}

export async function signDibayIntroMediaUpload(input: {
  introId: string;
  userId: string;
  originalName: string;
  mime: string;
  byteSize: number;
}): Promise<{ mediaId: string; path: string; token: string; signedUrl: string }> {
  if (!isAllowedMime(input.mime)) throw new Error("unsupported_mime");
  if (!Number.isFinite(input.byteSize) || input.byteSize <= 0 || input.byteSize > DIBAY_INTRO_MEDIA_MAX_BYTES) {
    throw new Error("invalid_size");
  }
  const ext = DIBAY_INTRO_ALLOWED_MIME[input.mime];
  const db = svc();
  const { data: inserted, error } = await db
    .from("dibay_intro_media")
    .insert({
      intro_id: input.introId,
      original_name: input.originalName.slice(0, 180),
      mime: input.mime,
      byte_size: Math.round(input.byteSize),
      status: "uploading",
      created_by: input.userId,
    })
    .select("id")
    .single();
  if (error || !inserted) throw new Error(error?.message ?? "sign_failed");
  const mediaId = inserted.id as string;
  const path = `${input.introId}/${mediaId}/source.${ext}`;
  const signed = await db.storage.from(DIBAY_INTRO_MEDIA_BUCKET).createSignedUploadUrl(path);
  if (signed.error || !signed.data?.token || !signed.data.signedUrl) {
    throw new Error(signed.error?.message ?? "sign_failed");
  }
  const { error: pathError } = await db
    .from("dibay_intro_media")
    .update({ source_path: path })
    .eq("id", mediaId);
  if (pathError) throw new Error(pathError.message);
  return { mediaId, path, token: signed.data.token, signedUrl: signed.data.signedUrl };
}

export async function processDibayIntroMedia(introId: string, mediaId: string): Promise<DibayIntroMediaRecord> {
  const db = svc();
  const { data: row, error } = await db
    .from("dibay_intro_media")
    .select("*")
    .eq("id", mediaId)
    .eq("intro_id", introId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error("not_found");
  const sourcePath = typeof row.source_path === "string" ? row.source_path : null;
  if (!sourcePath) throw new Error("missing_source");
  await db.from("dibay_intro_media").update({ status: "processing" }).eq("id", mediaId);

  const downloaded = await db.storage.from(DIBAY_INTRO_MEDIA_BUCKET).download(sourcePath);
  if (downloaded.error || !downloaded.data) {
    await db.from("dibay_intro_media").update({ status: "failed" }).eq("id", mediaId);
    throw new Error("download_failed");
  }
  const buf = Buffer.from(await downloaded.data.arrayBuffer());
  const mime = String(row.mime);
  let processed;
  try {
    processed = await processIntroMediaBytes(mime, buf);
  } catch {
    await db.from("dibay_intro_media").update({ status: "failed" }).eq("id", mediaId);
    throw new Error("decode_failed");
  }

  const ext = processed.runtimeExt;
  const runtimePath = `${introId}/${mediaId}/runtime.${ext}`;
  const uploaded = await db.storage.from(DIBAY_INTRO_MEDIA_BUCKET).upload(runtimePath, processed.bytes, {
    contentType: processed.mime,
    upsert: true,
  });
  if (uploaded.error) {
    await db.from("dibay_intro_media").update({ status: "failed" }).eq("id", mediaId);
    throw new Error(uploaded.error.message);
  }
  const { error: readyError } = await db
    .from("dibay_intro_media")
    .update({
      status: "ready",
      runtime_path: runtimePath,
      width: processed.width,
      height: processed.height,
      animated: processed.animated,
      checksum: sha256Bytes(processed.bytes),
      ready_at: new Date().toISOString(),
      byte_size: processed.bytes.byteLength,
    })
    .eq("id", mediaId);
  if (readyError) throw new Error(readyError.message);
  const listed = await listDibayIntroMedia(introId);
  const found = listed.find((item) => item.id === mediaId);
  if (!found || found.status !== "ready") throw new Error("process_failed");
  return found;
}

export function readyMediaIdSet(records: DibayIntroMediaRecord[]): Set<string> {
  return new Set(records.filter((row) => row.status === "ready").map((row) => row.id));
}
