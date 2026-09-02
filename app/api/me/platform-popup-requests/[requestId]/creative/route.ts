import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { randomUUID } from "crypto";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { validateActiveSession } from "@/lib/auth/server-guards";
import {
  extForCampaignImageMime,
  validateCampaignImageFile,
} from "@/lib/admin/notification-campaigns/validate-campaign-image";
import { loadPlatformPopupOwnerRequest } from "@/lib/platform-popup/owner-request-loader";
import { isOwnerEditablePlatformPopupRequest } from "@/lib/platform-popup/owner-request-lifecycle";
import { updatePlatformPopupOwnerDraft } from "@/lib/platform-popup/owner-request-writer";
import { PLATFORM_POPUP_CREATIVE_ASPECT } from "@/lib/platform-popup/types";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "platform-popup-creatives";
const TARGET_RATIO = PLATFORM_POPUP_CREATIVE_ASPECT.w / PLATFORM_POPUP_CREATIVE_ASPECT.h;
const RATIO_EPS = 0.01;

function centerCropTo3625(width: number, height: number): {
  left: number;
  top: number;
  width: number;
  height: number;
} {
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
 * Owner creative upload — bucket platform-popup-creatives.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ requestId: string }> }
): Promise<NextResponse> {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const session = await validateActiveSession(userId);
  if (!session.ok) return session.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });

  const { requestId } = await ctx.params;
  const row = await loadPlatformPopupOwnerRequest(sb, requestId);
  if (!row) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (row.ownerUserId !== userId) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  if (!isOwnerEditablePlatformPopupRequest(row.requestStatus)) {
    return NextResponse.json({ ok: false, error: "not_editable" }, { status: 409 });
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
  const path = `owner-requests/${requestId}/${userId}/${randomUUID()}.${ext}`;
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

  const updated = await updatePlatformPopupOwnerDraft(sb, {
    requestId,
    ownerUserId: userId,
    patch: {
      creativeAssetPath: path,
      creativeAssetUrl: publicUrl,
      creativeAltText: altText,
    },
  });
  if (!updated.ok) {
    return NextResponse.json(
      { ok: false, error: updated.error },
      { status: updated.httpStatus ?? 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    item: updated.row,
    path,
    url: publicUrl,
    width: outW,
    height: outH,
    aspect: "36:25",
    cropped: !ratioOk && applyCrop,
  });
}
