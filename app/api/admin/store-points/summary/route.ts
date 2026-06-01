import { NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/store-points/summary */
export async function GET() {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { data, error } = await sb.rpc("get_store_points_admin_summary");
  if (error) {
    if (/get_store_points_admin_summary/i.test(error.message)) {
      const { data: blocked } = await sb
        .from("stores")
        .select("id, store_name, point_balance, point_commerce_blocked")
        .eq("point_commerce_blocked", true)
        .limit(50);
      return NextResponse.json({
        ok: true,
        summary: {
          blocked_store_count: (blocked ?? []).length,
          pending_charge_count: 0,
          recent_deductions: [],
          recent_charges: [],
          blocked_stores: blocked ?? [],
        },
      });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const { data: blockedStores } = await sb
    .from("stores")
    .select("id, store_name, point_balance, point_commerce_blocked")
    .eq("point_commerce_blocked", true)
    .order("point_balance", { ascending: true })
    .limit(50);

  return NextResponse.json({
    ok: true,
    summary: {
      ...(typeof data === "object" && data !== null ? data : {}),
      blocked_stores: blockedStores ?? [],
    },
  });
}
