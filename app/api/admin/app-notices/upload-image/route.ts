import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import {
  CAMPAIGN_IMAGE_MAX_BYTES,
  extForCampaignImageMime,
  validateCampaignImageFile,
} from "@/lib/admin/notification-campaigns/validate-campaign-image";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Reuse existing admin image bucket — path prefix isolates Customer Center Content assets.
 * NOT Campaign delivery authority; purpose tracked by path: _admin/customer-center/{hero|body}/…
 * No new bucket / migration.
 */
const BUCKET = "admin-notification-campaign-images";

/** POST multipart: kind=hero|body, file */
export async function POST(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

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

  const kindRaw = form.get("kind");
  const kind = kindRaw === "hero" || kindRaw === "body" ? kindRaw : null;
  const file = form.get("file");
  if (!kind || !file || !(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const validated = validateCampaignImageFile(file);
  if (!validated.ok) {
    return NextResponse.json({ ok: false, error: validated.error }, { status: 400 });
  }

  if (file.size > CAMPAIGN_IMAGE_MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "file_too_large" }, { status: 400 });
  }

  const ext = extForCampaignImageMime(validated.mime);
  const path = `_admin/customer-center/${kind}/${randomUUID()}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await svc.storage.from(BUCKET).upload(path, buf, {
    contentType: validated.mime === "image/jpg" ? "image/jpeg" : validated.mime,
    upsert: false,
  });

  if (upErr) {
    const raw = String(upErr.message ?? "");
    if (/bucket not found/i.test(raw)) {
      return NextResponse.json({ ok: false, error: "storage_bucket_missing" }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: upErr.message || "upload_failed" }, { status: 500 });
  }

  const {
    data: { publicUrl },
  } = svc.storage.from(BUCKET).getPublicUrl(path);

  return NextResponse.json({ ok: true, kind, url: publicUrl, purpose: "customer_center_content" });
}
