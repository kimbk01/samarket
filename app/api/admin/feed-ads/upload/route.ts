import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
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
import {
  bannerGeometryRejectMessage,
  validateBannerCreativeGeometry,
} from "@/lib/stores/advertising/validate-banner-creative-geometry";
import { adminServerLanguage, adminServerText } from "@/lib/i18n/admin-server-language";

type UploadPurpose = "feed_ad" | "mypage_banner" | "event_hero_banner";

function uploadPurposeOf(raw: FormDataEntryValue | null): UploadPurpose {
  if (raw === "mypage_banner") return "mypage_banner";
  // EV-1: 이벤트 배포 히어로 배너(39:16) — 배달 홈 히어로와 같은 기하 검사
  if (raw === "event_hero_banner") return "event_hero_banner";
  return "feed_ad";
}

const PREFIX: Record<UploadPurpose, string> = {
  feed_ad: "_admin/feed-ads",
  mypage_banner: "_admin/mypage-banners",
  event_hero_banner: "_admin/event-banners/hero",
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Reuse existing admin image bucket — path prefix isolates feed ads. */
const BUCKET = "admin-notification-campaign-images";

/**
 * POST multipart `file` — PC file picker → Storage public URL.
 * No local path / blob URL persistence.
 */
export async function POST(req: NextRequest) {
  // IA-04 (K-2): 광고·홍보 콘텐츠 쓰기 = ads 키 (메뉴·CTA·API 동일 — admin-route-access.ts)
  const gate = await requireAdminPermission("ads");
  if (!gate.ok) return gate.response;
  const admin = { userId: gate.actor.userId };

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
  // 감사 AD-08: 마이페이지 배너도 같은 버킷·검증을 재사용한다 (경로·감사 대상만 구분).
  // EV-1: 이벤트 인라인 배너는 feed_ad(3:1) · 이벤트 히어로는 event_hero_banner(39:16)
  const purpose = uploadPurposeOf(form.get("purpose"));
  const path = `${PREFIX[purpose]}/${admin.userId}/${randomUUID()}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());

  // FA-3: 피드 배너는 3:1 · 최소 1200×400 / EV-1: 이벤트 히어로는 39:16 (배달 배너 업로드와 같은 방식 — sharp 로 크기 읽기)
  if (purpose !== "mypage_banner") {
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
    if (purpose === "feed_ad") {
      const geom = validateFeedAdUploadGeometry({ width, height });
      if (!geom.ok) {
        return NextResponse.json(
          { ok: false, error: geom.error, message: feedAdUploadRejectMessage(geom.error), width, height },
          { status: 400 }
        );
      }
    } else {
      const geom = validateBannerCreativeGeometry({ inventoryKey: "STORES_HOME_HERO", width, height });
      if (!geom.ok) {
        const message =
          geom.error === "invalid_dimensions"
            ? feedAdUploadRejectMessage("invalid_dimensions")
            : bannerGeometryRejectMessage({
                error: geom.error,
                guide: geom.guide,
                lang: await adminServerLanguage(),
                placementLabel: await adminServerText("admin_api_feed_ads_event_hero_banner"),
              });
        return NextResponse.json({ ok: false, error: geom.error, message, width, height }, { status: 400 });
      }
    }
  }

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

  await appendAdminRouteAudit(svc, req, {
    actorId: admin.userId,
    targetType: purpose === "mypage_banner" ? "mypage_banner_image" : "feed_ad_image",
    targetId: path,
    action: purpose === "mypage_banner" ? "mypage_banner_image.upload" : "feed_ad_image.upload",
    // EV-1: 이벤트 히어로 업로드도 같은 감사 대상(경로 접두어로 구분)
    after: { path, url: publicUrl, size: buf.length, contentType: validated.mime },
  });

  return NextResponse.json({ ok: true as const, url: publicUrl });
}
