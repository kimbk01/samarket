import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { insertReadyOpeningMedia } from "@/lib/opening-show/admin-writer.server";
import { processOpeningImageBuffer } from "@/lib/opening-show/media-process.server";
import {
  extForOpeningMime,
  normalizeOpeningMimeHint,
} from "@/lib/opening-show/media-validate";
import {
  OPENING_SHOW_BUCKET,
  assertOpeningStoragePath,
  openingDerivativePath,
  openingSourcePath,
} from "@/lib/opening-show/storage";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    showId?: string;
    mediaId?: string;
    mime?: string;
    fileName?: string;
  };
  const showId = String(body.showId ?? "").trim();
  const mediaId = String(body.mediaId ?? "").trim();
  const mimeHint = normalizeOpeningMimeHint(String(body.mime ?? ""));
  const fileName = String(body.fileName ?? "").trim() || "image";
  if (!showId || !mediaId || !mimeHint) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const sourcePath = openingSourcePath(showId, mediaId, extForOpeningMime(mimeHint));
  if (!assertOpeningStoragePath(sourcePath)) {
    return NextResponse.json({ ok: false, error: "invalid_storage_path" }, { status: 400 });
  }

  const downloaded = await sb.storage.from(OPENING_SHOW_BUCKET).download(sourcePath);
  if (downloaded.error || !downloaded.data) {
    return NextResponse.json(
      { ok: false, error: downloaded.error?.message || "source_missing" },
      { status: 400 }
    );
  }

  const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
  const processed = await processOpeningImageBuffer(bytes, mimeHint);
  if (!processed.ok) {
    return NextResponse.json({ ok: false, error: processed.error }, { status: 400 });
  }

  const displayPath = openingDerivativePath(showId, mediaId, "display");
  const thumbPath = openingDerivativePath(showId, mediaId, "thumb");
  const runtimeDisplayPath = openingDerivativePath(showId, mediaId, "runtimeDisplay");

  const displayUp = await sb.storage.from(OPENING_SHOW_BUCKET).upload(displayPath, processed.result.display.buf, {
    contentType: "image/webp",
    upsert: true,
  });
  if (displayUp.error) {
    return NextResponse.json({ ok: false, error: displayUp.error.message }, { status: 500 });
  }
  const thumbUp = await sb.storage.from(OPENING_SHOW_BUCKET).upload(thumbPath, processed.result.thumb.buf, {
    contentType: "image/webp",
    upsert: true,
  });
  if (thumbUp.error) {
    return NextResponse.json({ ok: false, error: thumbUp.error.message }, { status: 500 });
  }
  const runtimeUp = await sb.storage
    .from(OPENING_SHOW_BUCKET)
    .upload(runtimeDisplayPath, processed.result.display.buf, {
      contentType: "image/webp",
      upsert: true,
    });
  if (runtimeUp.error) {
    return NextResponse.json({ ok: false, error: runtimeUp.error.message }, { status: 500 });
  }

  const inserted = await insertReadyOpeningMedia(sb, {
    showId,
    mediaId,
    adminUserId: admin.userId,
    fileName,
    mime: processed.result.mime,
    byteSize: bytes.byteLength,
    width: processed.result.width,
    height: processed.result.height,
    sourcePath,
    displayPath,
    thumbPath,
    runtimeDisplayPath,
    displayWidth: processed.result.display.width,
    displayHeight: processed.result.display.height,
    displayBytes: processed.result.display.buf.byteLength,
    thumbWidth: processed.result.thumb.width,
    thumbHeight: processed.result.thumb.height,
    thumbBytes: processed.result.thumb.buf.byteLength,
    runtimeWidth: processed.result.display.width,
    runtimeHeight: processed.result.display.height,
    runtimeBytes: processed.result.display.buf.byteLength,
  });
  if (!inserted.ok) {
    return NextResponse.json({ ok: false, error: inserted.error }, { status: inserted.httpStatus });
  }

  return NextResponse.json({ ok: true, media: inserted.media });
}
