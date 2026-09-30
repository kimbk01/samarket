import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { R15_STARTUP_MEDIA_BUCKET, getPublicStorageUrl, sha256Hex } from "@/lib/startup-presentation/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 2 * 1024 * 1024;

function extForMime(mime: string): string | null {
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/webp") return "webp";
  return null;
}

export async function POST(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "file_required" }, { status: 400 });
  }
  const ext = extForMime(file.type);
  if (!ext) return NextResponse.json({ ok: false, error: "unsupported_mime" }, { status: 400 });
  if (file.size <= 0 || file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "invalid_size" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const assetId = randomUUID();
  const storagePath = `draft/${admin.userId}/${assetId}.${ext}`;
  const { error: uploadError } = await sb.storage
    .from(R15_STARTUP_MEDIA_BUCKET)
    .upload(storagePath, buf, {
      contentType: file.type,
      upsert: false,
    });
  if (uploadError) {
    return NextResponse.json(
      { ok: false, error: uploadError.message || "upload_failed" },
      { status: 500 }
    );
  }
  const publicUrl = await getPublicStorageUrl(sb, storagePath);
  const sha256 = sha256Hex(buf);
  const { error: insertError } = await sb.from("r15_startup_media").insert({
    asset_id: assetId,
    storage_path: storagePath,
    public_url: publicUrl,
    mime_type: file.type,
    byte_length: buf.byteLength,
    sha256,
    created_by: admin.userId,
  });
  if (insertError) {
    return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
  }
  return NextResponse.json({
    ok: true as const,
    asset: {
      assetId,
      storagePath,
      publicUrl,
      mimeType: file.type,
      byteLength: buf.byteLength,
      sha256,
    },
  });
}
