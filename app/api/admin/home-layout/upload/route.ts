import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import {
  extForCampaignImageMime,
  validateCampaignImageFile,
} from "@/lib/admin/notification-campaigns/validate-campaign-image";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  HOME_BANNER_IMAGE_PX,
  HOME_BANNER_RATIOS,
  HOME_IMAGE_MAX_BYTES,
  HOME_IMAGE_RATIO_TOLERANCE,
  HOME_SERVICE_IMAGE_PX,
  type HomeBannerRatio,
} from "@/lib/home/home-layout-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 기존 캠페인 이미지 버킷 재사용 — 경로만 나눈다 (새 버킷·DB 변경 없음) */
const BUCKET = "admin-notification-campaign-images";

/**
 * 어드민 「홈 구성」 이미지 올리기 — POST multipart: kind=banner|service, ratio(banner), file.
 * 검사: 형식 PNG/WebP/JPG · 2MB 이하 · 고른 비율과 ±2% 안 · 비율별 최소 px (계약 `HOME_BANNER_IMAGE_PX` / `HOME_SERVICE_IMAGE_PX`).
 * 저장 권한 = `settings` (홈 구성 저장과 같음).
 */
export async function POST(req: NextRequest) {
  const gate = await requireAdminPermission("settings");
  if (!gate.ok) return gate.response;

  const svc = tryCreateSupabaseServiceClient();
  if (!svc) return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 503 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_form" }, { status: 400 });
  }
  const kindRaw = form.get("kind");
  const kind = kindRaw === "banner" || kindRaw === "service" ? kindRaw : null;
  const file = form.get("file");
  if (!kind || !file || !(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  const ratioRaw = String(form.get("ratio") ?? "1:1");
  const ratio: HomeBannerRatio = (HOME_BANNER_RATIOS as readonly string[]).includes(ratioRaw)
    ? (ratioRaw as HomeBannerRatio)
    : "1:1";

  const validated = validateCampaignImageFile(file, { maxBytes: HOME_IMAGE_MAX_BYTES });
  if (!validated.ok) return NextResponse.json({ ok: false, error: validated.error }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  let width = 0;
  let height = 0;
  try {
    const meta = await sharp(buf).metadata();
    width = meta.width ?? 0;
    height = meta.height ?? 0;
  } catch {
    return NextResponse.json({ ok: false, error: "image_unreadable" }, { status: 400 });
  }
  if (!width || !height) return NextResponse.json({ ok: false, error: "image_unreadable" }, { status: 400 });

  const spec = kind === "banner" ? HOME_BANNER_IMAGE_PX[ratio] : HOME_SERVICE_IMAGE_PX;
  const want = spec.w / spec.h;
  const got = width / height;
  if (Math.abs(got - want) / want > HOME_IMAGE_RATIO_TOLERANCE) {
    return NextResponse.json(
      { ok: false, error: "ratio_mismatch", width, height, expected: kind === "banner" ? ratio : "1:1" },
      { status: 400 }
    );
  }
  if (width < spec.minW || height < spec.minH) {
    return NextResponse.json(
      { ok: false, error: "image_too_small", width, height, minWidth: spec.minW, minHeight: spec.minH },
      { status: 400 }
    );
  }

  const ext = extForCampaignImageMime(validated.mime);
  const dir = kind === "banner" ? "home-banners" : "home-cards";
  const path = `_admin/${dir}/${randomUUID()}.${ext}`;
  const { error: upErr } = await svc.storage.from(BUCKET).upload(path, buf, {
    contentType: validated.mime === "image/jpg" ? "image/jpeg" : validated.mime,
    upsert: false,
  });
  if (upErr) {
    const raw = String(upErr.message ?? "");
    if (/bucket not found/i.test(raw)) {
      return NextResponse.json({ ok: false, error: "storage_bucket_missing" }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: "upload_failed" }, { status: 500 });
  }
  const {
    data: { publicUrl },
  } = svc.storage.from(BUCKET).getPublicUrl(path);

  await appendAdminRouteAudit(svc, req, {
    actorId: gate.actor.userId,
    targetType: "home_layout_image",
    targetId: path,
    action: "home_layout_image.upload",
    after: { kind, ratio: kind === "banner" ? ratio : "1:1", path, url: publicUrl, width, height, size: buf.length },
  });

  return NextResponse.json({ ok: true, url: publicUrl, width, height });
}
