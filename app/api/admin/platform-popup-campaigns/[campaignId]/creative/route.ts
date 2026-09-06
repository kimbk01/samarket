import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { randomUUID } from "crypto";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { validateCampaignImageFile } from "@/lib/admin/notification-campaigns/validate-campaign-image";
import { replacePlatformPopupReadyCreative } from "@/lib/platform-popup/admin-campaign-writer";
import { processPlatformPopupCreativeToCanonical } from "@/lib/platform-popup/creative-pipeline";
import {
  DIBAY_CANONICAL_POPUP_CREATIVE_SIZE,
  POPUP_CREATIVE_SOURCE_MAX_BYTES,
} from "@/lib/platform-popup/creative-pixel-ssot";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "platform-popup-creatives";

/**
 * POST multipart `file` (+ optional applyCrop=center, altText)
 * Final production creative = DIBAY_CANONICAL_POPUP_CREATIVE_SIZE @ 36:25.
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

  const validated = validateCampaignImageFile(file, {
    maxBytes: POPUP_CREATIVE_SOURCE_MAX_BYTES,
  });
  if (!validated.ok) {
    const maxMb = Math.round(POPUP_CREATIVE_SOURCE_MAX_BYTES / (1024 * 1024));
    return NextResponse.json(
      {
        ok: false,
        error: validated.error,
        message:
          validated.error === "invalid_type"
            ? "JPG, PNG, WEBP 이미지만 사용할 수 있습니다."
            : validated.error === "file_too_large"
              ? `이미지 용량이 너무 큽니다. 원본은 ${maxMb}MB 이하로 올려 주세요. (서버에서 1440×1000 WebP로 최적화됩니다)`
              : "이미지 파일을 확인해 주세요.",
      },
      { status: 400 }
    );
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
    return NextResponse.json(
      { ok: false, error: "image_decode_failed", message: "이미지를 읽을 수 없습니다." },
      { status: 400 }
    );
  }
  if (!(width > 0) || !(height > 0)) {
    return NextResponse.json(
      { ok: false, error: "invalid_dimensions", message: "이미지 크기를 확인할 수 없습니다." },
      { status: 400 }
    );
  }

  const processed = await processPlatformPopupCreativeToCanonical({
    buffer: buf,
    width,
    height,
    applyCenterCrop: applyCrop,
  });

  if (!processed.ok) {
    if (processed.error === "needs_crop") {
      return NextResponse.json(
        {
          ok: false,
          error: "needs_crop",
          requiredAspect: "36:25",
          canonicalWidth: DIBAY_CANONICAL_POPUP_CREATIVE_SIZE.width,
          canonicalHeight: DIBAY_CANONICAL_POPUP_CREATIVE_SIZE.height,
          width,
          height,
          ratio: width / height,
          proposedCrop: processed.proposedCrop,
          message: "36:25 비율이 아닙니다. 크롭 결과를 확인한 뒤 적용해 주세요.",
        },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { ok: false, error: "crop_failed", message: "크롭에 실패했습니다. 다른 이미지를 시도해 주세요." },
      { status: 400 }
    );
  }

  const path = `campaigns/${campaignId}/${admin.userId}/${randomUUID()}.webp`;
  const { error: upErr } = await sb.storage.from(BUCKET).upload(path, processed.buffer, {
    contentType: "image/webp",
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
    width: processed.width,
    height: processed.height,
    aspect: "36:25",
    canonical: true,
    cropped: processed.cropped,
    revertedToReview: replaced.revertedToReview,
  });
}
