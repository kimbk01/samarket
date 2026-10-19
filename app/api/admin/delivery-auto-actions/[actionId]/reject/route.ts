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

  // L2 — 사유 필수 (화면 confirmAdminAction 과 같은 규칙). 메모는 선택, 사유와 함께 기록한다.
  let note = "";
  let reason = "";
  try {
    const j = (await req.json()) as { note?: string; reason?: string };
    note = typeof j?.note === "string" ? j.note.trim().slice(0, 1400) : "";
    reason = typeof j?.reason === "string" ? j.reason.trim().slice(0, 600) : "";
  } catch {
    note = "";
  }
  if (reason.length < 2) return NextResponse.json({ error: "reason_required" }, { status: 400 });
  note = [reason, note].filter(Boolean).join(" — ").slice(0, 2000);

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ error: "server_config" }, { status: 500 });
  }

  const { data, error } = await (sb as any).rpc("reject_delivery_alert_auto_action", {
    p_action_id: id,
    p_actor: admin.actor.userId,
    p_note: note || null,
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
    const status = payload.error === "not_found" ? 404 : payload.error === "not_pending" ? 409 : 400;
    return NextResponse.json(payload, { status });
  }

  await appendAdminRouteAudit(admin.sb, req, {
    actorId: admin.actor.userId,
    targetType: "delivery_operation_alert_action",
    targetId: id,
    action: "delivery_auto_action.reject",
    after: { reason, note: note || null, result: payload },
  });

  return NextResponse.json({ ok: true, result: payload });
}
