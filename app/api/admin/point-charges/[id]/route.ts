import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { appendAuditLog } from "@/lib/audit/append-audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PatchBody {
  action?: "approve" | "reject" | "hold";
  adminMemo?: string;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const gate = await requireAdminPermission("point");
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const requestId = id?.trim();
  if (!requestId) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  let body: Partial<PatchBody>;
  try {
    body = (await req.json()) as Partial<PatchBody>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const { sb, actor } = gate;
  const now = new Date().toISOString();

  if (body.adminMemo !== undefined) {
    await sb
      .from("point_charge_requests")
      .update({ admin_memo: String(body.adminMemo).slice(0, 2000), updated_at: now })
      .eq("id", requestId);
  }

  const action = body.action;
  if (!action) {
    return NextResponse.json({ ok: true });
  }

  const { data: reqRow, error: fetchErr } = await sb
    .from("point_charge_requests")
    .select("id, user_id, point_amount, request_status")
    .eq("id", requestId)
    .maybeSingle();
  if (fetchErr) {
    return NextResponse.json({ ok: false, error: fetchErr.message }, { status: 500 });
  }
  if (!reqRow) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const row = reqRow as { user_id: string; point_amount: number; request_status: string };
  if (row.request_status !== "pending" && row.request_status !== "on_hold" && row.request_status !== "waiting_confirm") {
    return NextResponse.json({ ok: false, error: "not_found_or_already_processed" }, { status: 400 });
  }

  if (action === "approve") {
    const userId = row.user_id;
    const pointAmount = Math.max(0, Number(row.point_amount) || 0);
    const { data: profile } = await sb.from("profiles").select("points").eq("id", userId).maybeSingle();
    const current = Math.max(0, Number((profile as { points?: number } | null)?.points ?? 0));
    const nextBalance = current + pointAmount;

    const { error: ledgerErr } = await sb.from("point_ledger").insert({
      user_id: userId,
      entry_type: "charge_approved",
      amount: pointAmount,
      balance_after: nextBalance,
      related_type: "point_charge_request",
      related_id: requestId,
      description: "포인트 충전 승인",
      actor_type: "admin",
    });
    if (ledgerErr) {
      return NextResponse.json({ ok: false, error: ledgerErr.message }, { status: 500 });
    }

    await sb.from("profiles").update({ points: nextBalance }).eq("id", userId);
    await sb
      .from("point_charge_requests")
      .update({ request_status: "approved", updated_at: now })
      .eq("id", requestId);

    void appendAuditLog(sb, {
      actor_type: "admin",
      actor_id: actor.userId,
      target_type: "point_charge_request",
      target_id: requestId,
      action: "approve",
      after_json: { balance: nextBalance },
    });

    return NextResponse.json({ ok: true, balance: nextBalance });
  }

  const nextStatus = action === "reject" ? "rejected" : "on_hold";
  const { error: uErr } = await sb
    .from("point_charge_requests")
    .update({ request_status: nextStatus, updated_at: now })
    .eq("id", requestId);
  if (uErr) {
    return NextResponse.json({ ok: false, error: uErr.message }, { status: 500 });
  }

  void appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: actor.userId,
    target_type: "point_charge_request",
    target_id: requestId,
    action: nextStatus,
  });

  return NextResponse.json({ ok: true, request_status: nextStatus });
}
