/**
 * 공용 관리자 처리 (원래 app/api/admin/point-charges/[id]/route.ts 본문 그대로 이동). 서버 전용.
 * 원래 라우트(권한 키 `point`)와 거래 Admin 라우트(O-2 활성 관리자 전원)가 같은 처리를 공유한다 — 데이터·규칙 SSOT 하나.
 */
import "server-only";
import type { SharedAdminHandlerGate } from "@/lib/admin/shared-handlers/shared-admin-handler-gate";
import { NextRequest, NextResponse } from "next/server";
import { appendCommunityAdminAudit } from "@/lib/admin/community-admin/community-admin-audit";
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
import { keepAliveAfterResponse } from "@/lib/push/keep-alive-after-response";


const ACTIONABLE_STATUSES = ["pending", "waiting_confirm", "on_hold"] as const;

interface PatchBody {
  action?: "approve" | "reject" | "hold";
  adminMemo?: string;
  /** 승인: 입금 확인 근거 (거래 시각·참조번호 등) — 필수 (C-05) */
  verificationNote?: string;
  /** 반려: 회원에게 전달되는 사유 — 필수 (C-22) */
  rejectReason?: string;
}

/** GET /api/admin/point-charges/[id] */
export async function handleAdminPointChargeGet(
  gate: SharedAdminHandlerGate,
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {

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

export async function handleAdminPointChargePatch(
  gate: SharedAdminHandlerGate,
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {

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
    const { data: memoBefore } = await sb
      .from("point_charge_requests")
      .select("admin_memo")
      .eq("id", requestId)
      .maybeSingle();
    const nextMemo = String(body.adminMemo).slice(0, 2000);
    const { error: memoErr } = await sb
      .from("point_charge_requests")
      .update({ admin_memo: nextMemo, updated_at: now })
      .eq("id", requestId);
    if (memoErr) {
      if (isMissingPointsTable(memoErr.message ?? "", "point_charge_requests")) {
        return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
      }
      return NextResponse.json({ ok: false, error: memoErr.message }, { status: 500 });
    }
    await appendCommunityAdminAudit(sb, req, {
      actorId: actor.userId,
      targetType: "point_charge_request",
      targetId: requestId,
      action: "admin_memo_update",
      before: { admin_memo: (memoBefore as { admin_memo?: string | null } | null)?.admin_memo ?? null },
      after: { admin_memo: nextMemo },
    });
  }

  const verificationNote = String(body.verificationNote ?? "").trim();
  const rejectReason = String(body.rejectReason ?? "").trim();
  if (body.action === "approve" && verificationNote.length < 2) {
    return NextResponse.json({ ok: false, error: "verification_required" }, { status: 400 });
  }
  if (body.action === "reject" && rejectReason.length < 2) {
    return NextResponse.json({ ok: false, error: "reject_reason_required" }, { status: 400 });
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
    // 입금 확인 근거·확인자를 같은 트랜잭션에서 기록한 뒤 기존 승인 RPC 실행 (M6).
    const { data, error } = await sb.rpc("approve_user_point_charge_request_verified", {
      p_request_id: requestId,
      p_admin_user_id: actor.userId,
      p_verification_note: verificationNote.slice(0, 500),
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
      if (errCode === "verification_required") {
        return NextResponse.json({ ok: false, error: "verification_required" }, { status: 400 });
      }
      if (errCode === "already_processed") {
        return NextResponse.json({ ok: false, error: "not_found_or_already_processed" }, { status: 400 });
      }
      if (errCode === "user_not_found") {
        return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
      }
      if (errCode === "snapshot_invalid") {
        /* 신청 시점 요금제·금액 스냅샷 불일치 — 승인 차단 (UI: admin_api_err_snapshot_invalid) */
        return NextResponse.json(
          { ok: false, error: "snapshot_invalid", message_key: "admin_api_err_snapshot_invalid" },
          { status: 400 }
        );
      }
      return NextResponse.json({ ok: false, error: errCode }, { status: 400 });
    }

    const userId = String(result.user_id ?? row.user_id);
    const pointAmount = Math.max(0, Number(result.point_amount ?? row.point_amount) || 0);
    const nextBalance = Math.max(0, Number(result.balance_after) || 0);

    await appendCommunityAdminAudit(sb, req, {
      actorId: actor.userId,
      targetType: "point_charge_request",
      targetId: requestId,
      action: "approve",
      before: { request_status: row.request_status },
      after: { balance: nextBalance, point_amount: pointAmount, verification_note: verificationNote.slice(0, 500) },
    });

    keepAliveAfterResponse(notifyUserPointChargeApproved(sb, {
      userId,
      pointAmount,
      balanceAfter: nextBalance,
      requestId,
    }).catch(() => {}));

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
      ...(action === "reject" ? { reject_reason: rejectReason.slice(0, 500) } : {}),
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

  await appendCommunityAdminAudit(sb, req, {
    actorId: actor.userId,
    targetType: "point_charge_request",
    targetId: requestId,
    action: nextStatus,
    reason: action === "reject" ? rejectReason.slice(0, 500) : null,
    before: { request_status: row.request_status },
    after: { request_status: nextStatus },
  });

  if (action === "reject" && userId) {
    keepAliveAfterResponse(notifyUserPointChargeRejected(sb, { userId, requestId, reason: rejectReason }).catch(() => {}));
  }
  if (action === "hold" && userId) {
    keepAliveAfterResponse(notifyUserPointChargeOnHold(sb, { userId, requestId }).catch(() => {}));
  }

  return NextResponse.json({
    ok: true,
    request_status: nextStatus,
    user_id: userId,
  });
}
