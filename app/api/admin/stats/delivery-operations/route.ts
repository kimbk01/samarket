import { NextResponse } from "next/server";
import { manilaLastNDaysRangeUtc } from "@/lib/admin/metrics/manila-period";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  loadStoreCommissionBreakdown,
  loadStorePlatformPayable,
} from "@/lib/stores/commission/load-store-commission-ledger";
import { resolveStoreCommissionPeriod } from "@/lib/stores/commission/store-commission-ledger-query";
import {
  ADMIN_INCLUDE_TEST_STORES_PARAM,
  loadAdminRealStoreIds,
  parseAdminIncludeTestStores,
} from "@/lib/admin/metrics/admin-store-kind-scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ error: "server_config" }, { status: 500 });
  }

  const sp = new URL(req.url).searchParams;
  const daysRaw = Number(sp.get("days") ?? "14");
  const days = Number.isFinite(daysRaw) ? Math.min(90, Math.max(1, Math.floor(daysRaw))) : 14;
  // S-12 / DB-2 — 기본 = 실매장만, `?include_test=1` = 테스트 매장 포함 (기존 전 매장 집계).
  const includeTest = parseAdminIncludeTestStores(sp.get(ADMIN_INCLUDE_TEST_STORES_PARAM));

  // 일 경계는 Asia/Manila 자정 — RPC 일별 버킷(AT TIME ZONE 'Asia/Manila')과 동일 달력.
  const { todayStartIso, todayEndExIso, rangeStartIso } = manilaLastNDaysRangeUtc(days);

  const sbAny = sb as any;

  const [dashRes, healthRes] = await Promise.all([
    sbAny.rpc("admin_delivery_operations_dashboard", {
      p_today_start: todayStartIso,
      p_today_end_ex: todayEndExIso,
      p_range_start: rangeStartIso,
      p_range_end_ex: todayEndExIso,
      p_include_test: includeTest,
    }),
    sbAny.rpc("admin_delivery_operations_health"),
  ]);

  const { data, error } = dashRes;
  if (error) {
    const msg = String(error.message ?? "");
    if (/function .* does not exist|Could not find the function/i.test(msg)) {
      return NextResponse.json(
        { error: "rpc_missing", hint: "Apply migration admin_delivery_operations_dashboard" },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "rpc_failed", message: msg.slice(0, 240) }, { status: 500 });
  }

  let healthPatch: Record<string, unknown> = {};
  const he = healthRes.error;
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

  // Money KPIs come from the commission/payable SSOT (Asia/Manila "today"), not legacy
  // store_settlements snapshots — those are store-collected money, not platform revenue or payables.
  const today = resolveStoreCommissionPeriod("today", null, null);
  let ssotKpis: Record<string, number | null> = {};
  try {
    // 같은 범위를 SSOT 조회의 매장 목록 인자로 적용 (SSOT SQL 함수는 변경하지 않음). 실매장 0곳이면 0.
    const storeIds = includeTest ? null : await loadAdminRealStoreIds(sb as never);
    if (!includeTest && storeIds === null) throw new Error("real_store_ids_unavailable");
    if (storeIds && storeIds.length === 0) {
      ssotKpis = { platform_revenue_today: 0, settlement_pending_amount_today: 0 };
    } else {
      const [bd, pay] = await Promise.all([
        loadStoreCommissionBreakdown(sb, { storeIds, fromIso: today.fromIso, toIso: today.toIso, group: "day" }),
        loadStorePlatformPayable(sb, { storeIds, fromIso: today.fromIso, toIso: today.toIso, view: "payable", limit: 1, offset: 0 }),
      ]);
      ssotKpis = {
        platform_revenue_today: bd.reduce((sum, r) => sum + r.netCommissionMinor, 0) / 100,
        settlement_pending_amount_today: pay.summary.payablePhp,
      };
    }
  } catch {
    // SSOT RPC not deployed yet → show unavailable rather than the misleading legacy figure.
    ssotKpis = { platform_revenue_today: null, settlement_pending_amount_today: null };
  }
  const base = data != null && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const baseKpis = base.kpis != null && typeof base.kpis === "object" ? (base.kpis as Record<string, unknown>) : null;
  const payload = {
    ...base,
    ...(baseKpis ? { kpis: { ...baseKpis, ...ssotKpis } } : {}),
    ...healthPatch,
    query: {
      days,
      timezone: "Asia/Manila",
      range_start: rangeStartIso,
      range_end_ex: todayEndExIso,
      include_test: includeTest,
    },
  };

  return NextResponse.json(payload);
}
