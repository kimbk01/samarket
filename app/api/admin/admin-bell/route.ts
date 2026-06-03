import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/admin-bell
 *
 * 어드민 전용 알림 벨 집계 — 일반 유저 알림 API(/api/me/notifications)가 아닌
 * 어드민 액션이 필요한 항목만 COUNT 반환.
 *
 * 집계 소스 (병렬):
 * - store_point_charge_requests.request_status = 'pending'  — 포인트 충전 대기
 * - reports.status = 'pending'                              — 통합 신고 대기
 * - store_reports.status = 'open'                           — 매장 신고 대기
 * - delivery_operation_alert_events.event_status IN (...)    — 활성 배달 알림
 */
export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json(
      { ok: true, total: 0, by_category: { charges: 0, reports: 0, alerts: 0 } }
    );
  }

  const [chargesRes, reportsRes, storeReportsRes, alertsRes] = await Promise.all([
    sb
      .from("store_point_charge_requests")
      .select("id", { count: "exact", head: true })
      .eq("request_status", "pending"),

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

  const charges = chargesRes.count ?? 0;
  const reports = (reportsRes.count ?? 0) + (storeReportsRes.count ?? 0);
  const alerts = alertsRes.count ?? 0;
  const total = charges + reports + alerts;

  return NextResponse.json({
    ok: true,
    total,
    by_category: {
      charges,
      reports,
      alerts,
    },
  });
}
