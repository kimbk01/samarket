import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ actionId: string }> }) {
  const admin = await requireAdminPermission("business");
  if (!admin.ok) return admin.response;

  const { actionId } = await ctx.params;
  const id = String(actionId ?? "").trim();
  if (!id) return NextResponse.json({ error: "invalid_action_id" }, { status: 400 });

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ error: "server_config" }, { status: 500 });
  }

  const { data, error } = await (sb as any).rpc("retry_delivery_alert_auto_action", {
    p_action_id: id,
    p_actor: admin.actor.userId,
  });

  if (error) {
    const msg = String(error.message ?? "");
    if (/function .* does not exist|Could not find the function/i.test(msg)) {
      return NextResponse.json({ error: "rpc_missing", hint: "Apply migration delivery_auto_actions_safety" }, { status: 503 });
    }
    return NextResponse.json({ error: msg.slice(0, 240) }, { status: 500 });
  }

  const payload = data as Record<string, unknown> | null;
  if (payload && typeof payload.error === "string") {
    const code = payload.error;
    const status =
      code === "not_found"
        ? 404
        : code === "kill_switch_off" || code === "max_retries" || code === "event_not_open"
          ? 409
          : 400;
    return NextResponse.json(payload, { status });
  }

  await appendAdminRouteAudit(admin.sb, req, {
    actorId: admin.actor.userId,
    targetType: "delivery_operation_alert_action",
    targetId: id,
    action: "delivery_auto_action.retry",
    after: { result: payload },
  });

  return NextResponse.json({ ok: true, result: payload });
}
