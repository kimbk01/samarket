import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import { ADMIN_REASON_REQUIRED_CODE, parseAdminReason } from "@/lib/admin/operator-ux/admin-reason";
import {
  adminAssignSupportCase,
  adminDeleteSupportMessage,
  adminEditSupportMessage,
  adminReplySupportCase,
  adminSetSupportCasePriority,
  adminUpdateSupportCaseStatus,
  enrichSupportCasesForAdminDisplay,
  getSupportCaseForAdmin,
  listSupportFollowupIssueSelections,
  listSupportMessages,
  markSupportCaseNotificationsRead,
  markSupportCaseReadForAdmin,
  supportShownListSeenAt,
  reopenSupportCase,
} from "@/lib/support/support-case-service";
import type { SupportCasePriority, SupportCaseStatus } from "@/lib/support/support-case-types";

/** DB CHECK `support_cases.priority IN ('NORMAL','HIGH','URGENT')` (20261202170000) — 최종 감사 L4 */
const SUPPORT_CASE_PRIORITIES: readonly SupportCasePriority[] = ["NORMAL", "HIGH", "URGENT"];

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ caseId: string }> }
) {
  // RS-04: 고객지원 케이스 조회·처리 = `support` 키
  const adminGate = await requireAdminPermission("support");
  if (!adminGate.ok) return adminGate.response;
  const { caseId } = await context.params;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  const gate = await getSupportCaseForAdmin(sb, caseId);
  if (!gate.ok) {
    const status = gate.error === "not_found" ? 404 : gate.error === "case_fetch_failed" ? 500 : 400;
    return NextResponse.json({ ok: false, error: gate.error }, { status });
  }
  const messages = await listSupportMessages(sb, { caseId, includeInternal: true });
  if (!messages.ok) {
    return NextResponse.json({ ok: false, error: messages.error }, { status: 500 });
  }
  // 2차 재감사 E: 돌려준 글 목록 기준 시각 — 그 뒤 새 고객 글이 왔으면 읽음 0 으로 만들지 않는다
  // 최종 점검 L6: 위에서 읽은 문의 행을 그대로(문의 행 2번 읽지 않음) · M8: 바뀔 값이 없으면 쓰지 않음
  await markSupportCaseReadForAdmin(sb, caseId, supportShownListSeenAt(messages.messages, gate.case.last_message_at), gate.case);
  // Phase 3 A3 — clear this admin's support_customer_replied bell rows for the case.
  // 재감사 D15: 권한 확인이 이미 본 관리자 id 를 쓴다(인증 조회 1번).
  await markSupportCaseNotificationsRead(sb, {
    userId: adminGate.actor.userId,
    caseId,
    includeAdmin: true,
    // 남은 위험 5: 보여 준 고객 공개 글의 알림만 읽음
    shownCustomerMessageIds: messages.messages
      .filter((m) => (m.sender_type === "MEMBER" || m.sender_type === "OWNER") && m.message_type === "PUBLIC")
      .map((m) => m.id),
  });
  // DEF-09: detail carries the same display-only identity fields as the queue, so the
  // header keeps the member name when the case is not in the current filtered list.
  // 재감사 D8: 진행 중 문의에 이어 붙은 접수에서 고객이 고른 세부 (글 id → 세부)
  // 최종 감사 L11: 서로 무관한 두 읽기는 동시에
  const [[displayCase], followupIssues] = await Promise.all([
    enrichSupportCasesForAdminDisplay(sb, [gate.case]),
    listSupportFollowupIssueSelections(sb, caseId),
  ]);
  return NextResponse.json({
    ok: true,
    case: displayCase ?? gate.case,
    messages: messages.messages,
    followupIssues,
  });
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ caseId: string }> }
) {
  // RS-04: 고객지원 케이스 조회·처리 = `support` 키
  const adminGate = await requireAdminPermission("support");
  if (!adminGate.ok) return adminGate.response;
  // 재감사 D15: 권한 확인이 본 관리자 id 를 그대로 쓴다(인증 조회 1번)
  const auth = { userId: adminGate.actor.userId };
  const { caseId } = await context.params;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    body?: string;
    status?: string;
    priority?: string;
    assigneeAdminId?: string | null;
    internalNote?: boolean;
    messageId?: string;
    reason?: unknown;
    /** 최종 감사 D1: 답변할 때 화면이 보여 준 문의 `last_message_at` */
    seenLastMessageAt?: unknown;
  };

  // F3: 성공한 변경만 관리자 감사 로그에 남긴다 (메시지 본문은 기록하지 않음).
  const audit = (action: string, after: Record<string, unknown>) =>
    appendAdminRouteAudit(sb, req, {
      actorId: auth.userId,
      targetType: "support_case",
      targetId: caseId,
      action: `support_case.${action}`,
      after,
    });

  // 최종 감사 D1 · 최종 점검 M6: 본 마지막 글 시각 — 없으면(옛 화면) 예전 동작. 있는데 시각이 아니면 400(잘못 보내면 알림을 덜 남기거나 잘못 닫을 수 있어 거부).
  const parseSeen = (): { ok: true; value: string | null } | { ok: false } => {
    if (body.seenLastMessageAt == null || body.seenLastMessageAt === "") return { ok: true, value: null };
    const raw = typeof body.seenLastMessageAt === "string" ? body.seenLastMessageAt.trim() : "";
    if (!raw || !Number.isFinite(Date.parse(raw))) return { ok: false };
    return { ok: true, value: raw };
  };
  const invalidSeen = () => NextResponse.json({ ok: false, error: "invalid_seen_last_message_at" }, { status: 400 });

  if (body.action === "reply") {
    const seenParsed = parseSeen();
    if (!seenParsed.ok) return invalidSeen();
    const seenLastMessageAt = seenParsed.value;
    const res = await adminReplySupportCase(sb, {
      adminUserId: auth.userId,
      caseId,
      body: String(body.body ?? ""),
      internalNote: body.internalNote === true,
      seenLastMessageAt,
    });
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: res.error }, { status: 400 });
    }
    await audit("reply", { internalNote: body.internalNote === true });
    // unseenCustomerMessages > 0 = 답을 쓰는 사이 온 고객 글이 있어 문의가 「답변 필요」로 남았다(화면이 다시 읽는다)
    return NextResponse.json({ ok: true, message: res.message, unseenCustomerMessages: res.unseenCustomerMessages });
  }

  if (body.action === "assign") {
    const res = await adminAssignSupportCase(sb, {
      adminUserId: auth.userId,
      caseId,
      assigneeAdminId: body.assigneeAdminId ?? null,
    });
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: res.error }, { status: 400 });
    }
    await audit("assign", { assigneeAdminId: body.assigneeAdminId ?? null });
    return NextResponse.json({ ok: true, case: res.case });
  }

  if (body.action === "status" && body.status) {
    // 최종 점검 M6: 「상담 종료」 때 화면이 본 문의 last_message_at — 그 뒤 새 글이 왔으면 닫지 않는다(case_updated → 409)
    const seenParsed = parseSeen();
    if (!seenParsed.ok) return invalidSeen();
    const res = await adminUpdateSupportCaseStatus(sb, {
      adminUserId: auth.userId,
      caseId,
      status: body.status as SupportCaseStatus,
      seenLastMessageAt: seenParsed.value,
    });
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: res.error }, { status: res.error === "case_updated" ? 409 : 400 });
    }
    await audit("status", { status: body.status });
    return NextResponse.json({ ok: true, case: res.case });
  }

  if (body.action === "priority" && body.priority) {
    if (!(SUPPORT_CASE_PRIORITIES as readonly string[]).includes(body.priority)) {
      return NextResponse.json({ ok: false, error: "invalid_priority" }, { status: 400 });
    }
    const res = await adminSetSupportCasePriority(sb, {
      adminUserId: auth.userId,
      caseId,
      priority: body.priority as SupportCasePriority,
    });
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: res.error }, { status: 400 });
    }
    await audit("priority", { priority: body.priority });
    return NextResponse.json({ ok: true, case: res.case });
  }

  if (body.action === "reopen") {
    const res = await reopenSupportCase(sb, {
      userId: auth.userId,
      caseId,
      isAdmin: true,
    });
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: res.error }, { status: 400 });
    }
    await audit("reopen", {});
    return NextResponse.json({ ok: true, case: res.case });
  }

  // Console redesign — case management: 보관 / 보관 해제 (status ARCHIVED ↔ RESOLVED).
  if (body.action === "archive" || body.action === "unarchive") {
    const res = await adminUpdateSupportCaseStatus(sb, {
      adminUserId: auth.userId,
      caseId,
      status: body.action === "archive" ? "ARCHIVED" : "RESOLVED",
    });
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: res.error }, { status: 400 });
    }
    await audit(body.action, {});
    return NextResponse.json({ ok: true, case: res.case });
  }

  // Console redesign — admin edits / deletes own message (soft, audited).
  if (body.action === "edit_message" || body.action === "delete_message") {
    const messageId = String(body.messageId ?? "").trim();
    if (!messageId) {
      return NextResponse.json({ ok: false, error: "invalid_message" }, { status: 400 });
    }
    // 메시지 삭제 = delete(L3) — 화면 확인창 사유 필수 (유일한 호출자 AdminSupportPage 가 보낸다).
    const deleteReason = body.action === "delete_message" ? parseAdminReason(body.reason) : null;
    if (body.action === "delete_message" && !deleteReason) {
      return NextResponse.json({ ok: false, error: ADMIN_REASON_REQUIRED_CODE }, { status: 400 });
    }
    const res =
      body.action === "edit_message"
        ? await adminEditSupportMessage(sb, {
            adminUserId: auth.userId,
            caseId,
            messageId,
            body: String(body.body ?? ""),
          })
        : await adminDeleteSupportMessage(sb, { adminUserId: auth.userId, caseId, messageId });
    if (!res.ok) {
      const status = res.error === "not_own_message" ? 403 : res.error === "not_found" ? 404 : 400;
      return NextResponse.json({ ok: false, error: res.error }, { status });
    }
    await audit(body.action, deleteReason ? { messageId, reason: deleteReason } : { messageId });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });
}
