import { NextRequest, NextResponse } from "next/server";
import { manilaLastNDaysRangeUtc } from "@/lib/admin/metrics/manila-period";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RuntimeSettingsRow = {
  singleton: number;
  enable_pg_cron: boolean;
  enable_realtime_optimization: boolean;
  enable_auto_actions: boolean;
  enable_alert_runner: boolean;
  enable_recovery_runner: boolean;
  enable_delivery_realtime_filtering: boolean;
  updated_at?: string | null;
};

type CapabilitiesRow = {
  singleton: number;
  pg_version: string | null;
  pg_version_num: number | null;
  supports_pg_cron: boolean;
  supports_publication_column_filter: boolean;
  supports_advanced_rpc: boolean;
  supports_advisory_lock: boolean;
  supports_realtime_optimization: boolean;
  checked_at?: string | null;
};

function computeEffectiveRuntime(
  caps: CapabilitiesRow | null,
  s: RuntimeSettingsRow
): {
  effective: RuntimeSettingsRow;
  warnings: { code: string; message: string }[];
} {
  const warnings: { code: string; message: string }[] = [];
  const supportsPgCron = caps?.supports_pg_cron ?? false;
  const supportsPubCols = caps?.supports_publication_column_filter ?? false;
  const supportsRtOpt = caps?.supports_realtime_optimization ?? false;

  const effective: RuntimeSettingsRow = {
    ...s,
    enable_pg_cron: s.enable_pg_cron && supportsPgCron,
    enable_realtime_optimization: s.enable_realtime_optimization && supportsRtOpt,
    enable_delivery_realtime_filtering: s.enable_delivery_realtime_filtering && supportsPubCols,
  };

  if (s.enable_pg_cron && !supportsPgCron) {
    warnings.push({ code: "pg_cron_unsupported", message: "pg_cron 미지원: enable_pg_cron이 runtime에서 OFF로 처리됨" });
  }
  if (s.enable_delivery_realtime_filtering && !supportsPubCols) {
    warnings.push({
      code: "publication_columns_unsupported",
      message: "publication 컬럼 필터 미지원(PG15+ 필요): enable_delivery_realtime_filtering이 runtime에서 OFF로 처리됨",
    });
  }
  if (s.enable_realtime_optimization && !supportsRtOpt) {
    warnings.push({
      code: "realtime_optimization_unsupported",
      message: "Realtime 최적화 미지원: enable_realtime_optimization이 runtime에서 OFF로 처리됨",
    });
  }

  return { effective, warnings };
}

export async function GET(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 503 });
  }
  const sbAny = sb as any;

  const sp = req.nextUrl.searchParams;
  const daysRaw = Number(sp.get("days") ?? "7");
  const days = Number.isFinite(daysRaw) ? Math.min(30, Math.max(1, Math.floor(daysRaw))) : 7;

  // 일 경계는 Asia/Manila 자정 — RPC 일별 버킷(AT TIME ZONE 'Asia/Manila')과 동일 달력.
  const { todayStartIso, todayEndExIso, rangeStartIso } = manilaLastNDaysRangeUtc(days);

  // 1) Delivery ops dashboard + health (single roundtrip each)
  const [dashRes, healthRes] = await Promise.all([
    sbAny.rpc("admin_delivery_operations_dashboard", {
      p_today_start: todayStartIso,
      p_today_end_ex: todayEndExIso,
      p_range_start: rangeStartIso,
      p_range_end_ex: todayEndExIso,
      // S-12 / DB-2 — 실시간 상황판은 처리 큐 화면: 기존과 같이 전 매장 집계 (통계 화면만 실매장 기본).
      p_include_test: true,
    }),
    sbAny.rpc("admin_delivery_operations_health"),
  ]);

  const dashErr = dashRes.error as { message?: string } | null;
  if (dashErr) {
    const msg = String(dashErr.message ?? "");
    if (/function .* does not exist|Could not find the function/i.test(msg)) {
      return NextResponse.json(
        { ok: false, error: "rpc_missing_admin_delivery_operations_dashboard", hint: "Apply migration admin_delivery_operations_dashboard" },
        { status: 503 }
      );
    }
    return NextResponse.json({ ok: false, error: "rpc_failed_dashboard", message: msg.slice(0, 240) }, { status: 500 });
  }

  let healthPatch: Record<string, unknown> = {};
  const he = healthRes.error as { message?: string } | null;
  if (!he && healthRes.data != null) {
    healthPatch = { health: healthRes.data };
  } else if (he) {
    const hm = String(he.message ?? "");
    if (/function .* does not exist|Could not find the function/i.test(hm)) {
      healthPatch = {
        health: null,
        health_rpc_missing: true,
        health_rpc_hint: "Apply migration 20260516120000_delivery_operations_recovery_center",
      };
    } else {
      healthPatch = {
        health: null,
        health_rpc_error: hm.slice(0, 200),
      };
    }
  } else {
    healthPatch = { health: null };
  }

  const deliveryOps =
    dashRes.data != null && typeof dashRes.data === "object"
      ? { ...(dashRes.data as Record<string, unknown>), ...healthPatch, query: { days } }
      : { ...healthPatch, query: { days } };

  // 1.5) 큐 행(주문 단위 합치기·ID 보강·우선순위·페이지)은 GET /api/admin/ops-console/queue 가 DB 에서 한 번에 만든다 (R7).
  //      여기서는 KPI·차트·health 만 돌려준다 — 이전의 600건 상한 보강 조회는 없앴다.

  // 2) Auto actions counts (fast KPI)
  const [{ count: failedAutoActions }, { count: pendingApprovals }] = await Promise.all([
    sbAny
      .from("delivery_operation_alert_actions")
      .select("id", { head: true, count: "exact" })
      .eq("action_status", "failed"),
    sbAny
      .from("delivery_operation_alert_actions")
      .select("id", { head: true, count: "exact" })
      .eq("action_status", "pending_approval"),
  ]);

  // 3) Runtime health (capabilities detect + settings)
  const capRes = await sbAny.rpc("detect_platform_runtime_capabilities", { p_force: false });
  const capabilities = (capRes.data ?? null) as CapabilitiesRow | null;

  const setRes = await sbAny
    .from("platform_runtime_settings")
    .select(
      "singleton, enable_pg_cron, enable_realtime_optimization, enable_auto_actions, enable_alert_runner, enable_recovery_runner, enable_delivery_realtime_filtering, updated_at"
    )
    .eq("singleton", 1)
    .maybeSingle();

  const settings =
    (setRes.data as RuntimeSettingsRow | null) ?? ({
      singleton: 1,
      enable_pg_cron: true,
      enable_realtime_optimization: true,
      enable_auto_actions: false,
      enable_alert_runner: true,
      enable_recovery_runner: true,
      enable_delivery_realtime_filtering: true,
    } satisfies RuntimeSettingsRow);

  const runtime = computeEffectiveRuntime(capabilities, settings);

  return NextResponse.json({
    ok: true,
    viewer_admin_id: admin.userId,
    generated_at: new Date().toISOString(),
    deliveryOps,
    kpi: {
      failed_auto_actions: Number.isFinite(failedAutoActions) ? failedAutoActions : 0,
      pending_approvals: Number.isFinite(pendingApprovals) ? pendingApprovals : 0,
    },
    runtime: {
      capabilities,
      settings,
      effective: runtime.effective,
      warnings: runtime.warnings,
    },
  });
}

