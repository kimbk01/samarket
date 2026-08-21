import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { isMissingRelation } from "@/lib/admin-users/member-tab-query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DeletionRequestRow = {
  id: string;
  user_id: string;
  status: string;
  reason: string | null;
  requested_at: string;
  processed_at: string | null;
  processed_by: string | null;
  admin_note: string | null;
};

/**
 * 회원 탈퇴·삭제 요청 큐 (사용자 `/api/me/leave-request` 가 쌓는 account_deletion_requests).
 * 관리자는 목록 확인 후 회원 상세에서 거절·탈퇴·영구삭제를 실행한다.
 */
export async function GET(req: NextRequest) {
  const gate = await requireAdminPermission("users");
  if (!gate.ok) return gate.response;

  const { sb } = gate;
  const statusRaw = String(req.nextUrl.searchParams.get("status") ?? "open").trim().toLowerCase();
  const limit = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 50) || 50));

  let q = sb
    .from("account_deletion_requests")
    .select("id, user_id, status, reason, requested_at, processed_at, processed_by, admin_note")
    .order("requested_at", { ascending: false })
    .limit(limit);

  if (statusRaw === "open") {
    q = q.in("status", ["requested", "processing"]);
  } else if (statusRaw !== "all") {
    q = q.eq("status", statusRaw);
  }

  const { data, error } = await q;
  if (error) {
    if (isMissingRelation(error.message, "account_deletion_requests")) {
      return NextResponse.json({ ok: true, items: [], note: "table_missing" });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as DeletionRequestRow[];
  const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
  const profileById = new Map<
    string,
    { username: string | null; nickname: string | null; email: string | null; status: string | null }
  >();
  if (userIds.length > 0) {
    const { data: profiles } = await sb
      .from("profiles")
      .select("id, username, nickname, email, status")
      .in("id", userIds);
    for (const p of (profiles ?? []) as Array<{
      id: string;
      username: string | null;
      nickname: string | null;
      email: string | null;
      status: string | null;
    }>) {
      profileById.set(p.id, p);
    }
  }

  const items = rows.map((row) => {
    const profile = profileById.get(row.user_id);
    const loginId =
      String(profile?.username ?? "").trim() ||
      String(profile?.email ?? "").split("@")[0] ||
      row.user_id.slice(0, 8);
    return {
      id: row.id,
      userId: row.user_id,
      status: row.status,
      reason: row.reason,
      requestedAt: row.requested_at,
      processedAt: row.processed_at,
      processedBy: row.processed_by,
      adminNote: row.admin_note,
      memberLoginId: loginId,
      memberNickname: profile?.nickname ?? null,
      memberStatus: profile?.status ?? null,
    };
  });

  return NextResponse.json({ ok: true, items });
}

/**
 * 요청 거절만 이 엔드포인트에서 처리.
 * 탈퇴(withdraw)·영구삭제(purge)는 회원별 `/api/admin/users/[id]/delete` 를 사용한다
 * (동일 경로가 pending 요청을 completed 로 마킹).
 */
export async function POST(req: NextRequest) {
  const gate = await requireAdminPermission("users");
  if (!gate.ok) return gate.response;

  let body: { requestId?: string; action?: string; adminNote?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const requestId = String(body.requestId ?? "").trim();
  const action = String(body.action ?? "").trim().toLowerCase();
  const adminNote = String(body.adminNote ?? "").trim().slice(0, 2000);
  if (!requestId) {
    return NextResponse.json({ ok: false, error: "request_id_required" }, { status: 400 });
  }
  if (action !== "reject") {
    return NextResponse.json(
      {
        ok: false,
        error: "use_member_delete_for_withdraw_or_purge",
        message: "거절만 가능합니다. 탈퇴·영구삭제는 회원 상세의 삭제 API를 사용하세요.",
      },
      { status: 400 }
    );
  }

  const { sb, actor } = gate;
  const { data: row, error: loadErr } = await sb
    .from("account_deletion_requests")
    .select("id, user_id, status")
    .eq("id", requestId)
    .maybeSingle();
  if (loadErr) {
    return NextResponse.json({ ok: false, error: loadErr.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  const status = String((row as { status?: string }).status ?? "");
  if (status !== "requested" && status !== "processing") {
    return NextResponse.json({ ok: false, error: "not_open", status }, { status: 409 });
  }

  const now = new Date().toISOString();
  const userId = String((row as { user_id?: string }).user_id ?? "");
  const { error: updErr } = await sb
    .from("account_deletion_requests")
    .update({
      status: "rejected",
      processed_at: now,
      processed_by: actor.userId,
      admin_note: adminNote || "admin_rejected",
      updated_at: now,
    })
    .eq("id", requestId);
  if (updErr) {
    return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });
  }

  if (userId) {
    await sb
      .from("profiles")
      .update({ deletion_requested_at: null, updated_at: now })
      .eq("id", userId);
  }

  void appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: actor.userId,
    target_type: "account_withdrawal_request",
    target_id: userId || requestId,
    action: "admin.account_deletion.reject",
    before_json: { requestId, status },
    after_json: { requestId, status: "rejected", adminNote: adminNote || null, at: now },
  });

  return NextResponse.json({ ok: true, requestId, status: "rejected", at: now, actorId: actor.userId });
}
