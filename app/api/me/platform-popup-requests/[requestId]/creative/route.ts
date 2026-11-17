import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { validateCampaignImageFile } from "@/lib/admin/notification-campaigns/validate-campaign-image";
import { loadPlatformPopupOwnerRequest } from "@/lib/platform-popup/owner-request-loader";
import { isOwnerEditablePlatformPopupRequest } from "@/lib/platform-popup/owner-request-lifecycle";
import { updatePlatformPopupOwnerDraft } from "@/lib/platform-popup/owner-request-writer";
import {
  processPlatformPopupCreativeToCanonical,
  readPlatformPopupCreativeOrientedSize,
} from "@/lib/platform-popup/creative-pipeline";
import { checkPopupCreativeSourceSize } from "@/lib/platform-popup/creative-size-spec";
import { removeUnreferencedPopupCreativeFiles } from "@/lib/platform-popup/creative-storage-cleanup";
import {
  DIBAY_CANONICAL_POPUP_CREATIVE_SIZE,
  POPUP_CREATIVE_SOURCE_MAX_BYTES,
} from "@/lib/platform-popup/creative-pixel-ssot";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "platform-popup-creatives";

/** POST multipart `file` (+ optional applyCrop=center, altText) — canonical 1440×1000 @ 36:25 */
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

  const validated = validateCampaignImageFile(file, {
    maxBytes: POPUP_CREATIVE_SOURCE_MAX_BYTES,
  });
  if (!validated.ok) {
    return NextResponse.json({ ok: false, error: validated.error }, { status: 400 });
  }

  const applyCrop = String(form.get("applyCrop") ?? "").trim().toLowerCase() === "center";
  const altText = String(form.get("altText") ?? "").trim() || null;
  const buf = Buffer.from(await file.arrayBuffer());

  // 빌드 전 감사 A8: 보이는 방향(EXIF 회전 뒤) 크기 — 세로로 찍은 휴대폰 사진(방향 6)도 가운데 자르기가 맞게
  const oriented = await readPlatformPopupCreativeOrientedSize(buf);
  if (!oriented) {
    return NextResponse.json({ ok: false, error: "image_decode_failed" }, { status: 400 });
  }
  const { width, height } = oriented;
  if (!(width > 0) || !(height > 0)) {
    return NextResponse.json({ ok: false, error: "invalid_dimensions" }, { status: 400 });
  }
  // A8: 어드민 경로와 같은 원본 규격(최소 크기 · 4천만 화소 상한) — 디코드 전에 거절
  const size = checkPopupCreativeSourceSize({ creativeMode: "card", width, height });
  if (!size.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: size.error,
        width,
        height,
        ...(size.error === "popup_image_too_small" ? { minWidth: size.minWidth, minHeight: size.minHeight } : {}),
      },
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
        },
        { status: 400 }
      );
    }
    return NextResponse.json({ ok: false, error: "crop_failed" }, { status: 400 });
  }

  const path = `owner-requests/${requestId}/${userId}/${randomUUID()}.webp`;
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
    // 진입 감사 PO-9: 연결에 실패한 새 파일은 지운다
    await removeUnreferencedPopupCreativeFiles(sb, [path], "owner_request_update_failed");
    return NextResponse.json(
      { ok: false, error: updated.error },
      { status: updated.httpStatus ?? 400 }
    );
  }
  // 진입 감사 PO-9: 교체 전 소재 파일 — 다른 행(승인된 캠페인 소재 등)이 참조하지 않을 때만 지운다
  const previousPath = row.creativeAssetPath?.trim() || null;
  if (previousPath && previousPath !== path) {
    await removeUnreferencedPopupCreativeFiles(sb, [previousPath], "owner_request_replaced");
  }

  return NextResponse.json({
    ok: true,
    item: updated.row,
    path,
    url: publicUrl,
    width: processed.width,
    height: processed.height,
    aspect: "36:25",
    canonical: true,
    cropped: processed.cropped,
  });
}
