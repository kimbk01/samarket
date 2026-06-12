import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import {
  isMissingPointsTable,
  normalizeChargeRequest,
} from "@/lib/points/admin-user-points-shared";
import { POINT_CHARGE_REQUEST_ROW_SELECT } from "@/lib/points/point-query-select";
import {
  notifyUserPointChargeApproved,
  notifyUserPointChargeOnHold,
  notifyUserPointChargeRejected,
} from "@/lib/notifications/notify-user-points";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONABLE_STATUSES = ["pending", "waiting_confirm", "on_hold"] as const;

interface PatchBody {
  action?: "approve" | "reject" | "hold";
  adminMemo?: string;
}

/** GET /api/admin/point-charges/[id] */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const gate = await requireAdminPermission("point");
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const requestId = id?.trim();
  if (!requestId) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const { sb } = gate;
  const { data: row, error } = await sb
    .from("point_charge_requests")
    .select(POINT_CHARGE_REQUEST_ROW_SELECT)
    .eq("id", requestId)
    .maybeSingle();

  if (error) {
    if (isMissingPointsTable(error.message ?? "", "point_charge_requests")) {
      return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const rec = row as Record<string, unknown>;
  const userId = String(rec.user_id ?? "");
  const { data: profile } = await sb.from("profiles").select("nickname").eq("id", userId).maybeSingle();
  const userNickname = String((profile as { nickname?: string } | null)?.nickname ?? "");

  return NextResponse.json({
    ok: true,
    request: normalizeChargeRequest(rec, userId, userNickname),
  });
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
    const { error: memoErr } = await sb
      .from("point_charge_requests")
      .update({ admin_memo: String(body.adminMemo).slice(0, 2000), updated_at: now })
      .eq("id", requestId);
    if (memoErr) {
      if (isMissingPointsTable(memoErr.message ?? "", "point_charge_requests")) {
        return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
      }
      return NextResponse.json({ ok: false, error: memoErr.message }, { status: 500 });
    }
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
    if (isMissingPointsTable(fetchErr.message ?? "", "point_charge_requests")) {
      return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: fetchErr.message }, { status: 500 });
  }
  if (!reqRow) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const row = reqRow as { user_id: string; point_amount: number; request_status: string };
  if (!ACTIONABLE_STATUSES.includes(row.request_status as (typeof ACTIONABLE_STATUSES)[number])) {
    return NextResponse.json({ ok: false, error: "not_found_or_already_processed" }, { status: 400 });
  }

  if (action === "approve") {
    const { data, error } = await sb.rpc("approve_user_point_charge_request", {
      p_request_id: requestId,
      p_admin_user_id: actor.userId,
    });
    if (error) {
      if (/approve_user_point_charge_request/i.test(error.message ?? "")) {
        return NextResponse.json({ ok: false, error: "point_charge_rpc_missing" }, { status: 503 });
      }
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const result = (data ?? {}) as Record<string, unknown>;
    if (result.ok === false) {
      const errCode = String(result.error ?? "approve_failed");
      if (errCode === "not_found") {
        return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
      }
      if (errCode === "already_processed") {
        return NextResponse.json({ ok: false, error: "not_found_or_already_processed" }, { status: 400 });
      }
      if (errCode === "user_not_found") {
        return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
      }
      return NextResponse.json({ ok: false, error: errCode }, { status: 400 });
    }

    const userId = String(result.user_id ?? row.user_id);
    const pointAmount = Math.max(0, Number(result.point_amount ?? row.point_amount) || 0);
    const nextBalance = Math.max(0, Number(result.balance_after) || 0);

    void appendAuditLog(sb, {
      actor_type: "admin",
      actor_id: actor.userId,
      target_type: "point_charge_request",
      target_id: requestId,
      action: "approve",
      after_json: { balance: nextBalance },
    });

    void notifyUserPointChargeApproved(sb, {
      userId,
      pointAmount,
      balanceAfter: nextBalance,
      requestId,
    });

    return NextResponse.json({ ok: true, balance: nextBalance, user_id: userId, point_amount: pointAmount });
  }

  const nextStatus = action === "reject" ? "rejected" : "on_hold";
  const { data: updatedRow, error: uErr } = await sb
    .from("point_charge_requests")
    .update({
      request_status: nextStatus,
      updated_at: now,
      processed_at: now,
      processed_by: actor.userId,
    })
    .eq("id", requestId)
    .in("request_status", [...ACTIONABLE_STATUSES])
    .select("user_id")
    .maybeSingle();

  if (uErr) {
    if (isMissingPointsTable(uErr.message ?? "", "point_charge_requests")) {
      return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: uErr.message }, { status: 500 });
  }
  if (!updatedRow) {
    return NextResponse.json({ ok: false, error: "not_found_or_already_processed" }, { status: 400 });
  }

  const userId = String((updatedRow as { user_id?: string }).user_id ?? "");

  void appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: actor.userId,
    target_type: "point_charge_request",
    target_id: requestId,
    action: nextStatus,
  });

  if (action === "reject" && userId) {
    void notifyUserPointChargeRejected(sb, { userId, requestId });
  }
  if (action === "hold" && userId) {
    void notifyUserPointChargeOnHold(sb, { userId, requestId });
  }

  return NextResponse.json({
    ok: true,
    request_status: nextStatus,
    user_id: userId,
  });
}
