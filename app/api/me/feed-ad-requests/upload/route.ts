import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserIdStrict } from "@/lib/auth/api-session";
import {
  extForCampaignImageMime,
  validateCampaignImageFile,
} from "@/lib/admin/notification-campaigns/validate-campaign-image";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import sharp from "sharp";
import {
  feedAdUploadRejectMessage,
  validateFeedAdUploadGeometry,
} from "@/lib/ads/feed-ad-upload-geometry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "post-images";

/** Member Feed Ad creative upload — same mime rules as admin campaign images. */
export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserIdStrict();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const svc = tryCreateSupabaseServiceClient();
  if (!svc) {
    return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_form" }, { status: 400 });
  }

  const file = form.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "file_required" }, { status: 400 });
  }

  const validated = validateCampaignImageFile(file);
  if (!validated.ok) {
    return NextResponse.json({ ok: false, error: validated.error }, { status: 400 });
  }

  const ext = extForCampaignImageMime(validated.mime);
  const path = `feed-ad-requests/${auth.userId}/${randomUUID()}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());

  // FA-3: 관리자 피드 배너 업로드와 같은 규칙 — 3:1 · 최소 1200×400
  let width = 0;
  let height = 0;
  try {
    const meta = await sharp(buf, { failOn: "none", limitInputPixels: false }).rotate().metadata();
    width = meta.width ?? 0;
    height = meta.height ?? 0;
  } catch {
    return NextResponse.json(
      { ok: false, error: "image_decode_failed", message: feedAdUploadRejectMessage("image_decode_failed") },
      { status: 400 }
    );
  }
  const geom = validateFeedAdUploadGeometry({ width, height });
  if (!geom.ok) {
    return NextResponse.json(
      { ok: false, error: geom.error, message: feedAdUploadRejectMessage(geom.error), width, height },
      { status: 400 }
    );
  }

  const { error: upErr } = await svc.storage.from(BUCKET).upload(path, buf, {
    contentType: validated.mime === "image/jpg" ? "image/jpeg" : validated.mime,
    upsert: false,
  });

  if (upErr) {
    return NextResponse.json({ ok: false, error: upErr.message || "upload_failed" }, { status: 500 });
  }

  const { data: pub } = svc.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ ok: true, url: pub.publicUrl });
}
