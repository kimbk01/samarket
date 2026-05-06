import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

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

  const payload =
    data != null && typeof data === "object"
      ? { ...(data as Record<string, unknown>), ...healthPatch, query: { days } }
      : { ...healthPatch, query: { days } };

  return NextResponse.json(payload);
}
