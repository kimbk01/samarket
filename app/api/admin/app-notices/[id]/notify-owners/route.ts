import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin/require-admin-permission";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import {
  APP_NOTICES_CONTENT_SELECT,
  isCustomerCenterContentPublishedNow,
} from "@/lib/notices/customer-center-content";
import { isOwnerAnnouncementAudience } from "@/lib/notices/app-notice-audience";
import { sendOwnerAnnouncementNotifications } from "@/lib/notices/owner-announcements.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** 사장님 수만큼 알림을 보낸다 — 기본 제한 시간보다 길게 */
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/app-notices/[id]/notify-owners — 사장님 운영 공지 알림 발송 (배달 오픈 4단계).
 * - 슈퍼 관리자만 (`requireSuperAdmin`).
 * - 사장님 전용 공지(audience ≠ all)이고 지금 게시 중인 글만.
 * - 사장님 1명 = 알림 1건, 중복 방지 키 = 공지 id + 사장님 id → 다시 눌러도 같은 사장님에게 두 번 가지 않는다.
 * - 알림 링크 = 사장님 운영 공지 상세 (`/stores/owner/announcements/[id]?storeId=`).
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate.response;
  const sb = gate.sb;

  const { id: raw } = await ctx.params;
  const id = String(raw ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });

  const { data, error } = await sb.from("app_notices").select(APP_NOTICES_CONTENT_SELECT).eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: "notice_lookup_failed" }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const row = data as { audience?: string | null; title?: string | null; body?: string | null };
  if (!isOwnerAnnouncementAudience(row.audience)) {
    return NextResponse.json({ ok: false, error: "audience_not_store_owners" }, { status: 400 });
  }
  if (!isCustomerCenterContentPublishedNow(data)) {
    return NextResponse.json({ ok: false, error: "notice_not_published" }, { status: 409 });
  }

  let result;
  try {
    result = await sendOwnerAnnouncementNotifications(sb, {
      noticeId: id,
      title: String(row.title ?? ""),
      body: String(row.body ?? ""),
      audience: row.audience,
      adminActorId: gate.actor.userId,
    });
  } catch {
    return NextResponse.json({ ok: false, error: "recipients_lookup_failed" }, { status: 500 });
  }

  await appendAdminRouteAudit(sb, req, {
    actorId: gate.actor.userId,
    targetType: "app_notice",
    targetId: id,
    action: "app_notice.notify_store_owners",
    after: { audience: row.audience, ...result },
  });
  return NextResponse.json({ ok: true, ...result });
}
