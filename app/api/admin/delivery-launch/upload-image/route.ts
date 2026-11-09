import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin/require-admin-permission";
import {
  extForCampaignImageMime,
  validateCampaignImageFile,
} from "@/lib/admin/notification-campaigns/validate-campaign-image";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { processOwnerProductImageBuffer } from "@/lib/stores/owner-product-image-upload.server";
import {
  DELIVERY_LAUNCH_IMAGE_SPECS,
  isDeliveryLaunchImageKind,
  validateDeliveryLaunchImageGeometry,
} from "@/lib/delivery/launch/delivery-launch-contract";
import { internalErrorResponse } from "@/lib/security/internal-error-response";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 어드민 배너 이미지와 같은 버킷 — 경로 접두로 구분 */
const BUCKET = "admin-notification-campaign-images";

/**
 * POST multipart `file` + `kind`(mobile 4:3 · wide 2:1 · popup 36:25) — 배달 오픈 관리 이미지 업로드 (최고관리자).
 * JPG·PNG·WebP 2MB 이하 → sharp 재인코딩(EXIF 회전 반영·메타데이터 제거·WebP) → 저장 바이트 기준 비율 ±8%·최소 크기 검사.
 */
export async function POST(req: NextRequest) {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate.response;
  const svc = tryCreateSupabaseServiceClient();
  if (!svc) return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 503 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_form" }, { status: 400 });
  }
  const kind = String(form.get("kind") ?? "").trim();
  if (!isDeliveryLaunchImageKind(kind)) {
    return NextResponse.json({ ok: false, error: "invalid_kind" }, { status: 400 });
  }
  const file = form.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "file_required" }, { status: 400 });
  }
  const validated = validateCampaignImageFile(file);
  if (!validated.ok) return NextResponse.json({ ok: false, error: validated.error }, { status: 400 });

  let processed: Awaited<ReturnType<typeof processOwnerProductImageBuffer>>;
  try {
    processed = await processOwnerProductImageBuffer(Buffer.from(await file.arrayBuffer()), validated.mime);
  } catch (e) {
    const code = e instanceof Error ? e.message : "";
    if (code === "invalid_type") return NextResponse.json({ ok: false, error: "invalid_type" }, { status: 400 });
    return NextResponse.json({ ok: false, error: "image_decode_failed" }, { status: 400 });
  }
  const { width, height } = processed;
  const geom = validateDeliveryLaunchImageGeometry(kind, width, height);
  if (!geom.ok) {
    const spec = DELIVERY_LAUNCH_IMAGE_SPECS[kind];
    return NextResponse.json(
      { ok: false, error: geom.error, width, height, ratio: spec.ratioLabel, minWidth: spec.minWidth, minHeight: spec.minHeight },
      { status: 400 }
    );
  }

  const path = `_admin/delivery-launch/${kind}/${gate.actor.userId}/${randomUUID()}.${extForCampaignImageMime(processed.contentType)}`;
  const { error: upErr } = await svc.storage.from(BUCKET).upload(path, processed.buf, {
    contentType: processed.contentType,
    upsert: false,
  });
  if (upErr) {
    if (/bucket not found/i.test(String(upErr.message ?? ""))) {
      return NextResponse.json({ ok: false, error: "storage_bucket_missing" }, { status: 503 });
    }
    return internalErrorResponse("upload_failed", "[/api/admin/delivery-launch/upload-image POST]", upErr, 500);
  }
  const {
    data: { publicUrl },
  } = svc.storage.from(BUCKET).getPublicUrl(path);
  await appendAdminRouteAudit(svc, req, {
    actorId: gate.actor.userId,
    targetType: "delivery_launch_image",
    targetId: kind,
    action: "delivery_launch.upload_image",
    after: { kind, path, width, height },
  });
  return NextResponse.json({ ok: true as const, url: publicUrl, width, height, kind });
}
