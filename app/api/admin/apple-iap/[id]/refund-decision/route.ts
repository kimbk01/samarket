import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin/require-admin-permission";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import { appleIapIsUuid } from "@/lib/apple-iap/apple-iap-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const DECISIONS = new Set(["recover", "waive", "recredit"]);

/**
 * POST /api/admin/apple-iap/[id]/refund-decision — Apple 환불 관리자 결정.
 * body: { decision: "recover" | "waive" | "recredit", note }
 * recover = 잔액 범위 안 회수(음수 금지) · waive = 회수 안 함 · recredit = 환불 취소 후 회수분 되돌림.
 */
export async function POST(req: Request, ctx: Ctx) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const decision = String(body.decision ?? "").trim();
  const note = String(body.note ?? "").trim();
  if (!appleIapIsUuid(id) || !DECISIONS.has(decision)) {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }
  if (note.length < 2 || note.length > 500) {
    return NextResponse.json({ ok: false, error: "reason_required" }, { status: 400 });
  }

  const { data, error } = await guard.sb.rpc("apple_iap_admin_decide_refund", {
    p_attempt_id: id,
    p_admin_user_id: guard.actor.userId,
    p_decision: decision,
    p_note: note,
  });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const r = (data ?? {}) as Record<string, unknown>;
  if (r.ok !== true) {
    return NextResponse.json({ ok: false, error: String(r.error ?? "decision_failed"), detail: r }, { status: 409 });
  }
  await appendAdminRouteAudit(guard.sb, req, {
    actorId: guard.actor.userId,
    targetType: "apple_iap_transaction",
    targetId: id,
    action: `apple_iap.refund_${decision}`,
    after: { ...r, note },
  });
  return NextResponse.json({ ok: true, result: r });
}
