import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 수동 동기화 — 폴링과 분리(cron 과 동일 RPC). */
export async function POST() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ error: "server_config" }, { status: 500 });
  }

  const sbAny = sb as any;
  const { error } = await sbAny.rpc("sync_delivery_operation_alert_events");
  if (error) {
    const msg = String(error.message ?? "");
    if (/function .* does not exist|Could not find the function/i.test(msg)) {
      return NextResponse.json({ error: "rpc_missing", hint: "Apply migration delivery_operation_alert_engine" }, { status: 503 });
    }
    return NextResponse.json({ error: "sync_failed", message: msg.slice(0, 240) }, { status: 500 });
  }

  const { error: autoErr } = await sbAny.rpc("run_delivery_operation_alert_auto_actions");
  if (autoErr) {
    const msg = String(autoErr.message ?? "");
    if (/function .* does not exist|Could not find the function/i.test(msg)) {
      return NextResponse.json(
        { error: "auto_actions_rpc_missing", hint: "Apply migration delivery_alert_auto_actions_engine" },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "auto_actions_failed", message: msg.slice(0, 240) }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
