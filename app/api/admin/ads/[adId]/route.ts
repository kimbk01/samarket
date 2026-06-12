import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { creditUserPoints } from "@/lib/points/user-point-ledger";
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
    const db = await adminPatchPostAdInDb(svc, adId, adminId, action, adminNote, {
      refundPoints: async ({ userId, pointCost, adProductName }) => {
        await creditUserPoints(svc, {
          userId,
          amount: pointCost,
          entryType: "ad_refund",
          relatedType: "ad_application",
          relatedId: adId,
          description: `${adProductName ?? "광고"} 반려 환불`,
          actorType: "admin",
        });
      },
    });
    if (!db.ok) {
      return NextResponse.json(
        { ok: false, error: db.notFound ? "not_found" : db.error ?? "action_failed" },
        { status: db.notFound ? 404 : 400 }
      );
    }
    return NextResponse.json({ ok: true, source: "supabase" });
  }

  if (action === "update" || body.status || body.priority !== undefined || body.endAt) {
    const now = new Date().toISOString();
    const payload: Record<string, unknown> = { updated_at: now };
    if (adminNote !== undefined) payload.admin_note = adminNote ?? null;
    if (body.priority !== undefined) payload.priority = body.priority;
    if (body.endAt !== undefined) payload.end_at = body.endAt;
    if (body.status) payload.apply_status = body.status;

    const { data, error } = await svc
      .from("post_ads")
      .update(payload)
      .eq("id", adId)
      .select("id")
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ ok: false, error: error?.message ?? "not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, source: "supabase" });
  }

  return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });
}
