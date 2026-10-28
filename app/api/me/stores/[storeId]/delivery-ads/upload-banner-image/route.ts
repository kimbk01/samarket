import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { validateActiveSession } from "@/lib/auth/server-guards";
import {
  extForCampaignImageMime,
  validateCampaignImageFile,
} from "@/lib/admin/notification-campaigns/validate-campaign-image";
import { getStoreIfOwner, getStoreIfOwnerForOperationalWrite } from "@/lib/stores/owner-product-gate";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { isOwnerBannerInventoryKey } from "@/lib/stores/advertising/owner-banner-contract";
import { validateBannerCreativeGeometry } from "@/lib/stores/advertising/validate-banner-creative-geometry";
import { processOwnerProductImageBuffer } from "@/lib/stores/owner-product-image-upload.server";
import { enforceStoreOwnerImageUploadQuota } from "@/lib/security/rate-limit-presets";
import { parseBannerUploadCampaignSegment } from "@/lib/stores/advertising/banner-upload-campaign-segment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Same bucket as Admin banner finals; Owner path prefix isolates uploads. */
const BUCKET = "admin-notification-campaign-images";

/**
 * POST multipart `file` + `inventoryKey` — Owner Banner creative upload (mode A).
 * Returns storage path + dimensions for draft upsert.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ storeId: string }> }
) {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const session = await validateActiveSession(userId);
  if (!session.ok) return session.response;

  const { storeId } = await context.params;
  const sid = typeof storeId === "string" ? storeId.trim() : "";
  if (!sid) return NextResponse.json({ ok: false, error: "missing_store_id" }, { status: 400 });

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const gate = await getStoreIfOwnerForOperationalWrite(sb, userId, sid);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });

  // HB-6 — 상품 이미지 업로드와 같은 매장·사용자 횟수 제한
  const upRl = await enforceStoreOwnerImageUploadQuota(userId, sid);
  if (!upRl.ok) return upRl.response;

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

  const inventoryRaw = String(form.get("inventoryKey") ?? form.get("inventory_key") ?? "").trim();
  if (!isOwnerBannerInventoryKey(inventoryRaw)) {
    return NextResponse.json({ ok: false, error: "invalid_inventory" }, { status: 400 });
  }

  const file = form.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "file_required" }, { status: 400 });
  }

  const validated = validateCampaignImageFile(file);
  if (!validated.ok) {
    return NextResponse.json({ ok: false, error: validated.error }, { status: 400 });
  }

  // IMG-09: 상품 이미지와 같은 sharp 재인코딩 — EXIF 방향 적용(.rotate) · EXIF/GPS 메타데이터 제거 · WebP.
  // 실제 저장 바이트의 가로·세로로 비율·최소 픽셀을 검사한다.
  const rawBuf = Buffer.from(await file.arrayBuffer());
  let processed: Awaited<ReturnType<typeof processOwnerProductImageBuffer>>;
  try {
    processed = await processOwnerProductImageBuffer(rawBuf, validated.mime);
  } catch (e) {
    const code = e instanceof Error ? e.message : "";
    if (code === "invalid_type") {
      return NextResponse.json({ ok: false, error: "invalid_type" }, { status: 400 });
    }
    if (code === "image_dimension_too_large" || code === "image_dimension_invalid") {
      return NextResponse.json({ ok: false, error: "invalid_dimensions" }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: "image_decode_failed" }, { status: 400 });
  }
  const buf = processed.buf;
  const width = processed.width;
  const height = processed.height;
  if (!(width > 0) || !(height > 0)) {
    return NextResponse.json({ ok: false, error: "invalid_dimensions" }, { status: 400 });
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

  const ext = extForCampaignImageMime(processed.contentType);
  const campaignSeg = parseBannerUploadCampaignSegment(form.get("campaignId"), "draft");
  if (!campaignSeg.ok) return NextResponse.json({ ok: false, error: "invalid_campaign_id" }, { status: 400 });
  const campaignId = campaignSeg.segment;
  const path = `_owner/delivery-ads/banner/${sid}/${campaignId}/${userId}/${randomUUID()}.${ext}`;

  const { error: upErr } = await svc.storage.from(BUCKET).upload(path, buf, {
    contentType: processed.contentType,
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
    inventoryKey: inventoryRaw,
  });
}
