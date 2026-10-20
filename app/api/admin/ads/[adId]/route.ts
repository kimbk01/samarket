import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import type { AdApplyStatus } from "@/lib/ads/types";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { adminPatchPostAdInDb } from "@/lib/ads/post-ads-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PatchBody {
  action?: "approve" | "reject" | "cancel" | "expire" | "confirm_payment" | "update";
  adminNote?: string;
  priority?: number;
  endAt?: string;
  status?: AdApplyStatus;
}

/**
 * PATCH /api/admin/ads/[adId]
 * 관리자: 광고 신청 상태 변경 (승인/반려/취소/만료/메모)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ adId: string }> }
): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const { adId } = await params;
  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const { action, adminNote } = body;
  const adminId = admin.userId;

  const svc = tryCreateSupabaseServiceClient();
  if (!svc) {
    return NextResponse.json({ ok: false, error: "db_unavailable" }, { status: 503 });
  }

  if (
    action === "approve" ||
    action === "reject" ||
    action === "cancel" ||
    action === "expire" ||
    action === "confirm_payment"
  ) {
    const db = await adminPatchPostAdInDb(svc, adId, adminId, action, adminNote);
    if (!db.ok) {
      return NextResponse.json(
        { ok: false, error: db.notFound ? "not_found" : db.error ?? "action_failed" },
        { status: db.notFound ? 404 : db.httpStatus ?? 400 }
      );
    }
    await appendAdminRouteAudit(svc, req, {
      actorId: adminId,
      targetType: "post_ad",
      targetId: adId,
      action: `post_ad.${action}`,
      after: { action, adminNote: adminNote ?? null },
    });
    return NextResponse.json({ ok: true, source: "supabase" });
  }

  if (action === "update" || body.status || body.priority !== undefined || body.endAt) {
    /*
     * apply_status 는 generic update 로 직접 설정하지 않는다 — 환불·상태 전이 규칙이 있는
     * 전용 action(approve/reject/cancel/expire/confirm_payment) 경로로만 처리.
     */
    if (body.status) {
      return NextResponse.json(
        { ok: false, error: "status_change_requires_action" },
        { status: 400 }
      );
    }
    const now = new Date().toISOString();
    const payload: Record<string, unknown> = { updated_at: now };
    if (adminNote !== undefined) payload.admin_note = adminNote ?? null;
    if (body.priority !== undefined) payload.priority = body.priority;
    if (body.endAt !== undefined) payload.end_at = body.endAt;

    const { data, error } = await svc
      .from("post_ads")
      .update(payload)
      .eq("id", adId)
      .select("id")
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ ok: false, error: error?.message ?? "not_found" }, { status: 404 });
    }
    await appendAdminRouteAudit(svc, req, {
      actorId: adminId,
      targetType: "post_ad",
      targetId: adId,
      action: "post_ad.update",
      after: payload,
    });
    return NextResponse.json({ ok: true, source: "supabase" });
  }

  return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });
}
