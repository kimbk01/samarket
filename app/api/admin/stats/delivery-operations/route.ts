import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  loadStoreCommissionBreakdown,
  loadStorePlatformPayable,
} from "@/lib/stores/commission/load-store-commission-ledger";
import { resolveStoreCommissionPeriod } from "@/lib/stores/commission/store-commission-ledger-query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function todayBoundsLocal(now = new Date()): { todayStart: Date; todayEndEx: Date } {
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEndEx = new Date(todayStart);
  todayEndEx.setDate(todayEndEx.getDate() + 1);
  return { todayStart, todayEndEx };
}

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

  const { todayStart, todayEndEx } = todayBoundsLocal();
  const rangeStart = new Date(todayStart);
  rangeStart.setDate(rangeStart.getDate() - (days - 1));

  const sbAny = sb as any;

  const [dashRes, healthRes] = await Promise.all([
    sbAny.rpc("admin_delivery_operations_dashboard", {
      p_today_start: todayStart.toISOString(),
      p_today_end_ex: todayEndEx.toISOString(),
      p_range_start: rangeStart.toISOString(),
      p_range_end_ex: todayEndEx.toISOString(),
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
    const [bd, pay] = await Promise.all([
      loadStoreCommissionBreakdown(sb, { storeIds: null, fromIso: today.fromIso, toIso: today.toIso, group: "day" }),
      loadStorePlatformPayable(sb, { storeIds: null, fromIso: today.fromIso, toIso: today.toIso, view: "payable", limit: 1, offset: 0 }),
    ]);
    ssotKpis = {
      platform_revenue_today: bd.reduce((sum, r) => sum + r.netCommissionMinor, 0) / 100,
      settlement_pending_amount_today: pay.summary.payablePhp,
    };
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
    query: { days },
  };

  return NextResponse.json(payload);
}
