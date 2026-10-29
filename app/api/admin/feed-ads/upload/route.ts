import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import {
  extForCampaignImageMime,
  validateCampaignImageFile,
} from "@/lib/admin/notification-campaigns/validate-campaign-image";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

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
  const purpose = form.get("purpose") === "mypage_banner" ? "mypage_banner" : "feed_ad";
  const prefix = purpose === "mypage_banner" ? "_admin/mypage-banners" : "_admin/feed-ads";
  const path = `${prefix}/${admin.userId}/${randomUUID()}.${ext}`;
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

  await appendAdminRouteAudit(svc, req, {
    actorId: admin.userId,
    targetType: purpose === "mypage_banner" ? "mypage_banner_image" : "feed_ad_image",
    targetId: path,
    action: purpose === "mypage_banner" ? "mypage_banner_image.upload" : "feed_ad_image.upload",
    after: { path, url: publicUrl, size: buf.length, contentType: validated.mime },
  });

  return NextResponse.json({ ok: true as const, url: publicUrl });
}
