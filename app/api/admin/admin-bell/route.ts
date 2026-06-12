import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const USER_CHARGE_ACTIONABLE = ["pending", "waiting_confirm", "on_hold"] as const;

/**
 * GET /api/admin/admin-bell
 *
 * 어드민 전용 알림 벨 집계 — 일반 유저 알림 API(/api/me/notifications)가 아닌
 * 어드민 액션이 필요한 항목만 COUNT 반환.
 */
export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({
      ok: true,
      total: 0,
      by_category: {
        charges: 0,
        store_charges: 0,
        user_charges: 0,
        reports: 0,
        alerts: 0,
      },
    });
  }

  const [storeChargesRes, userChargesRes, reportsRes, storeReportsRes, alertsRes] = await Promise.all([
    sb
      .from("store_point_charge_requests")
      .select("id", { count: "exact", head: true })
      .eq("request_status", "pending"),

    sb
      .from("point_charge_requests")
      .select("id", { count: "exact", head: true })
      .in("request_status", [...USER_CHARGE_ACTIONABLE]),

    sb
      .from("reports")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),

    sb
      .from("store_reports")
      .select("id", { count: "exact", head: true })
      .eq("status", "open"),

    sb
      .from("delivery_operation_alert_events")
      .select("id", { count: "exact", head: true })
      .in("event_status", ["open", "acknowledged"]),
  ]);

  const storeCharges = storeChargesRes.error ? 0 : storeChargesRes.count ?? 0;
  const userCharges =
    userChargesRes.error && /point_charge_requests|schema cache|does not exist/i.test(userChargesRes.error.message ?? "")
      ? 0
      : userChargesRes.count ?? 0;
  const reports = (reportsRes.count ?? 0) + (storeReportsRes.count ?? 0);
  const alerts = alertsRes.count ?? 0;
  const charges = storeCharges + userCharges;
  const total = charges + reports + alerts;

  return NextResponse.json({
    ok: true,
    total,
    by_category: {
      charges,
      store_charges: storeCharges,
      user_charges: userCharges,
      reports,
      alerts,
    },
  });
}
