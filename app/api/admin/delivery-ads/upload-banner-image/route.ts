import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { randomUUID } from "crypto";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import {
  extForCampaignImageMime,
  validateCampaignImageFile,
} from "@/lib/admin/notification-campaigns/validate-campaign-image";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { isOwnerBannerInventoryKey } from "@/lib/stores/advertising/owner-banner-contract";
import { validateBannerCreativeGeometry } from "@/lib/stores/advertising/validate-banner-creative-geometry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "admin-notification-campaign-images";

/**
 * POST multipart `file` + optional `inventoryKey` — Admin Banner creative upload.
 * When inventoryKey present, shares Owner geometry validator (aspect + min pixels).
 */
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

  const file = form.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "file_required" }, { status: 400 });
  }

  const validated = validateCampaignImageFile(file);
  if (!validated.ok) {
    return NextResponse.json({ ok: false, error: validated.error }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  let width = 0;
  let height = 0;
  try {
    const meta = await sharp(buf, { failOn: "none", limitInputPixels: false })
      .rotate()
      .metadata();
    width = meta.width ?? 0;
    height = meta.height ?? 0;
  } catch {
    return NextResponse.json({ ok: false, error: "image_decode_failed" }, { status: 400 });
  }
  if (!(width > 0) || !(height > 0)) {
    return NextResponse.json({ ok: false, error: "invalid_dimensions" }, { status: 400 });
  }

  const inventoryRaw = String(form.get("inventoryKey") ?? form.get("inventory_key") ?? "").trim();
  if (inventoryRaw) {
    if (!isOwnerBannerInventoryKey(inventoryRaw)) {
      return NextResponse.json({ ok: false, error: "invalid_inventory" }, { status: 400 });
    }
    const geom = validateBannerCreativeGeometry({
      inventoryKey: inventoryRaw,
      width,
      height,
    });
    if (!geom.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: geom.error,
          minWidth: geom.guide?.minWidth,
          minHeight: geom.guide?.minHeight,
          ratio: geom.guide?.ratioLabel,
          width,
          height,
        },
        { status: 400 }
      );
    }
  }

  const ext = extForCampaignImageMime(validated.mime);
  const campaignId = String(form.get("campaignId") ?? "").trim() || "unbound";
  const path = `_admin/delivery-ads/banner/${campaignId}/${admin.userId}/${randomUUID()}.${ext}`;

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

  return NextResponse.json({
    ok: true as const,
    url: publicUrl,
    path,
    width,
    height,
    inventoryKey: inventoryRaw || null,
  });
}
