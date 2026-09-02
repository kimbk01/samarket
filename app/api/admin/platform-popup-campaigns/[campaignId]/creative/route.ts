import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { randomUUID } from "crypto";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import {
  extForCampaignImageMime,
  validateCampaignImageFile,
} from "@/lib/admin/notification-campaigns/validate-campaign-image";
import { replacePlatformPopupReadyCreative } from "@/lib/platform-popup/admin-campaign-writer";
import { PLATFORM_POPUP_CREATIVE_ASPECT } from "@/lib/platform-popup/types";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "platform-popup-creatives";
const TARGET_RATIO = PLATFORM_POPUP_CREATIVE_ASPECT.w / PLATFORM_POPUP_CREATIVE_ASPECT.h;
const RATIO_EPS = 0.01;

function centerCropTo3625(width: number, height: number): { left: number; top: number; width: number; height: number } {
  const current = width / height;
  if (current > TARGET_RATIO) {
    const cropW = Math.round(height * TARGET_RATIO);
    return { left: Math.floor((width - cropW) / 2), top: 0, width: cropW, height };
  }
  const cropH = Math.round(width / TARGET_RATIO);
  return { left: 0, top: Math.floor((height - cropH) / 2), width, height: cropH };
}

/**
 * POST multipart `file` (+ optional applyCrop=center, altText)
 * Enforces final production creative = 36:25 via explicit center crop when needed.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ campaignId: string }> }
): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  }

  const { campaignId } = await ctx.params;

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

  const applyCrop = String(form.get("applyCrop") ?? "").trim().toLowerCase() === "center";
  const altText = String(form.get("altText") ?? "").trim() || null;
  const buf = Buffer.from(await file.arrayBuffer());

  let width = 0;
  let height = 0;
  try {
    const meta = await sharp(buf, { failOn: "none", limitInputPixels: false }).rotate().metadata();
    width = meta.width ?? 0;
    height = meta.height ?? 0;
  } catch {
    return NextResponse.json({ ok: false, error: "image_decode_failed" }, { status: 400 });
  }
  if (!(width > 0) || !(height > 0)) {
    return NextResponse.json({ ok: false, error: "invalid_dimensions" }, { status: 400 });
  }

  const ratio = width / height;
  const ratioOk = Math.abs(ratio - TARGET_RATIO) <= RATIO_EPS;

  if (!ratioOk && !applyCrop) {
    const crop = centerCropTo3625(width, height);
    return NextResponse.json(
      {
        ok: false,
        error: "needs_crop",
        requiredAspect: "36:25",
        width,
        height,
        ratio,
        proposedCrop: crop,
        message:
          "Image is not 36:25. Re-upload with applyCrop=center to apply deterministic center crop, or provide a pre-cropped 36:25 asset.",
      },
      { status: 400 }
    );
  }

  let outBuf: Buffer = buf;
  let outW = width;
  let outH = height;
  if (!ratioOk && applyCrop) {
    const crop = centerCropTo3625(width, height);
    try {
      outBuf = await sharp(buf, { failOn: "none", limitInputPixels: false })
        .rotate()
        .extract(crop)
        .webp({ quality: 88 })
        .toBuffer();
      outW = crop.width;
      outH = crop.height;
    } catch {
      return NextResponse.json({ ok: false, error: "crop_failed" }, { status: 400 });
    }
  } else {
    // Normalize to webp without stretch when already 36:25.
    try {
      outBuf = await sharp(buf, { failOn: "none", limitInputPixels: false })
        .rotate()
        .webp({ quality: 88 })
        .toBuffer();
    } catch {
      outBuf = buf;
    }
  }

  const ext = ratioOk && !applyCrop ? extForCampaignImageMime(validated.mime) : "webp";
  const path = `campaigns/${campaignId}/${admin.userId}/${randomUUID()}.${ext}`;
  const contentType =
    ext === "webp" ? "image/webp" : validated.mime === "image/jpg" ? "image/jpeg" : validated.mime;

  const { error: upErr } = await sb.storage.from(BUCKET).upload(path, outBuf, {
    contentType,
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
  } = sb.storage.from(BUCKET).getPublicUrl(path);

  const replaced = await replacePlatformPopupReadyCreative(sb, {
    campaignId,
    adminUserId: admin.userId,
    assetPath: path,
    assetUrl: publicUrl,
    altText,
  });
  if (!replaced.ok) {
    return NextResponse.json(
      { ok: false, error: replaced.error },
      { status: replaced.httpStatus ?? 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    creativeId: replaced.creativeId,
    path,
    url: publicUrl,
    width: outW,
    height: outH,
    aspect: "36:25",
    cropped: !ratioOk && applyCrop,
    revertedToReview: replaced.revertedToReview,
  });
}
