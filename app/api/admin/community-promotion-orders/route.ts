import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { mapPointPromotionOrderRow } from "@/lib/points/point-promotion-orders-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/community-promotion-orders?status=pending_review */
export async function GET(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const status = (req.nextUrl.searchParams.get("status") || "pending_review").trim();
  let q = sb
    .from("point_promotion_orders")
    .select("*")
    .eq("domain", "community")
    .order("created_at", { ascending: false })
    .limit(100);
  if (status) q = q.eq("order_status", status);

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const orders = (data ?? []).map((r) => {
    const mapped = mapPointPromotionOrderRow(r as Record<string, unknown>);
    return {
      ...mapped,
      reviewReason:
        (r as { review_reason?: string | null }).review_reason != null
          ? String((r as { review_reason?: string | null }).review_reason)
          : null,
    };
  });

  return NextResponse.json({ ok: true, orders });
}
