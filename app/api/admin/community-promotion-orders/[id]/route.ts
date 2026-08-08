import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  approveCommunityPaidExposure,
  rejectCommunityPaidExposure,
} from "@/lib/promotion/apply-community-paid-exposure";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/admin/community-promotion-orders/[id]
 * body: { action: "approve" | "reject", reason?: string }
 */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const { id } = await ctx.params;
  const orderId = (id ?? "").trim();
  if (!orderId) {
    return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });
  }

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    reason?: string;
  };
  const action = (body.action ?? "").trim();

  if (action === "approve") {
    const res = await approveCommunityPaidExposure(sb, {
      orderId,
      adminUserId: admin.userId,
    });
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: res.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, endAt: res.endAt });
  }

  if (action === "reject") {
    const res = await rejectCommunityPaidExposure(sb, {
      orderId,
      reason: body.reason ?? "",
    });
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: res.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });
}
