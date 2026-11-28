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
  adminSeenSupportCase,
  getSupportCaseForAdmin,
  listSupportFollowupIssueSelections,
  listSupportMessages,
  parseSupportRequestId,
  reopenSupportCase,
} from "@/lib/support/support-case-service";
import { normalizeShownMessageIds } from "@/lib/support/support-notification-ledger";
import { supportErrorHttpStatus } from "@/lib/support/support-display-labels";
import type { SupportCasePriority, SupportCaseStatus } from "@/lib/support/support-case-types";

/** DB CHECK `support_cases.priority IN ('NORMAL','HIGH','URGENT')` (20261202170000) — 최종 감사 L4 */
const SUPPORT_CASE_PRIORITIES: readonly SupportCasePriority[] = ["NORMAL", "HIGH", "URGENT"];

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fail = (error: string) => NextResponse.json({ ok: false, error }, { status: supportErrorHttpStatus(error) });

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ caseId: string }> }
) {
  // RS-04: 고객지원 케이스 조회·처리 = `support` 키
  const adminGate = await requireAdminPermission("support");
  if (!adminGate.ok) return adminGate.response;
  const { caseId } = await context.params;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return fail("supabase_unconfigured");
  const gate = await getSupportCaseForAdmin(sb, caseId);
  if (!gate.ok) return fail(gate.error);
  const messages = await listSupportMessages(sb, { caseId, includeInternal: true });
  if (!messages.ok) return fail(messages.error);
  // 전체 수정 계약 §3 (A-1): GET 은 읽기만 — 읽음은 화면이 실제로 보일 때 `PATCH { action: "seen" }`
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
  if (!sb) return fail("supabase_unconfigured");

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
    /** 계약 §3: `seen` — 화면에 보인 글 id */
    shownMessageIds?: unknown;
    /** 계약 §1: 답변·메모 요청 id */
    requestId?: unknown;
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
  const invalidSeen = () => fail("invalid_seen_last_message_at");

  // 전체 수정 계약 §3 (A-1): 화면에 실제로 보인 글만 읽음 — 지금까지 GET 안에서 하던 규칙 그대로(그 어드민 것만 · 보여 준 고객 글까지)
  if (body.action === "seen") {
    const shown = normalizeShownMessageIds(body.shownMessageIds);
    if (!shown) return fail("invalid_shown_message_ids");
    const seenParsed = parseSeen();
    if (!seenParsed.ok) return invalidSeen();
    const res = await adminSeenSupportCase(sb, {
      adminUserId: auth.userId,
      caseId,
      shownMessageIds: shown,
      seenLastMessageAt: seenParsed.value,
    });
    if (!res.ok) return fail(res.error);
    return NextResponse.json({ ok: true, notificationsRead: res.notificationsRead });
  }

  if (body.action === "reply") {
    const seenParsed = parseSeen();
    if (!seenParsed.ok) return invalidSeen();
    const seenLastMessageAt = seenParsed.value;
    const requestId = parseSupportRequestId(body.requestId);
    if (requestId === "invalid") return fail("invalid_request_id");
    // 계약 §1: 같은 요청 id 재전송 판정은 저장 DB 함수가 잠금 안에서 한다(처음 결과 · 답변·고객 푸시·미읽음 증가·감사 기록 없음).
    //   어드민 답변에는 속도 제한이 없어 미리 확인할 이유가 없다 — 요청 예산(답변 경로 조회 1회 줄임).
    const res = await adminReplySupportCase(sb, {
      adminUserId: auth.userId,
      caseId,
      body: String(body.body ?? ""),
      internalNote: body.internalNote === true,
      seenLastMessageAt,
      clientRequestId: requestId,
    });
    if (!res.ok) return fail(res.error);
    if (res.replayed) {
      return NextResponse.json({ ok: true, message: res.message, unseenCustomerMessages: 0, replayed: true });
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
    if (!res.ok) return fail(res.error);
    await audit("assign", { assigneeAdminId: body.assigneeAdminId ?? null });
    return NextResponse.json({ ok: true, case: res.case });
  }

  if (body.action === "status" && body.status) {
    // D-2 (2026-11-29): status 동작은 「상담 종료」(RESOLVED) 하나 — 보관·보관 해제는 archive·unarchive 동작만(같은 일 두 경로 제거)
    if (body.status !== "RESOLVED") return fail("invalid_transition");
    // 최종 점검 M6: 「상담 종료」 때 화면이 본 문의 last_message_at — 그 뒤 새 글이 왔으면 닫지 않는다(case_updated → 409)
    const seenParsed = parseSeen();
    if (!seenParsed.ok) return invalidSeen();
    const res = await adminUpdateSupportCaseStatus(sb, {
      adminUserId: auth.userId,
      caseId,
      status: body.status as SupportCaseStatus,
      mode: "close",
      seenLastMessageAt: seenParsed.value,
    });
    if (!res.ok) return fail(res.error);
    await audit("status", { status: body.status });
    return NextResponse.json({ ok: true, case: res.case });
  }

  if (body.action === "priority" && body.priority) {
    if (!(SUPPORT_CASE_PRIORITIES as readonly string[]).includes(body.priority)) {
      return fail("invalid_priority");
    }
    const res = await adminSetSupportCasePriority(sb, {
      adminUserId: auth.userId,
      caseId,
      priority: body.priority as SupportCasePriority,
    });
    if (!res.ok) return fail(res.error);
    await audit("priority", { priority: body.priority });
    return NextResponse.json({ ok: true, case: res.case });
  }

  if (body.action === "reopen") {
    const res = await reopenSupportCase(sb, {
      userId: auth.userId,
      caseId,
      isAdmin: true,
    });
    if (!res.ok) return fail(res.error);
    await audit("reopen", {});
    return NextResponse.json({ ok: true, case: res.case });
  }

  // Console redesign — case management: 보관 / 보관 해제 (status ARCHIVED ↔ RESOLVED).
  if (body.action === "archive" || body.action === "unarchive") {
    const res = await adminUpdateSupportCaseStatus(sb, {
      adminUserId: auth.userId,
      caseId,
      status: body.action === "archive" ? "ARCHIVED" : "RESOLVED",
      mode: body.action,
    });
    if (!res.ok) return fail(res.error);
    await audit(body.action, {});
    return NextResponse.json({ ok: true, case: res.case });
  }

  // Console redesign — admin edits / deletes own message (soft, audited).
  if (body.action === "edit_message" || body.action === "delete_message") {
    const messageId = String(body.messageId ?? "").trim();
    if (!messageId) return fail("invalid_message");
    // 메시지 삭제 = delete(L3) — 화면 확인창 사유 필수 (유일한 호출자 AdminSupportPage 가 보낸다).
    const deleteReason = body.action === "delete_message" ? parseAdminReason(body.reason) : null;
    if (body.action === "delete_message" && !deleteReason) return fail(ADMIN_REASON_REQUIRED_CODE);
    const res =
      body.action === "edit_message"
        ? await adminEditSupportMessage(sb, {
            adminUserId: auth.userId,
            caseId,
            messageId,
            body: String(body.body ?? ""),
          })
        : await adminDeleteSupportMessage(sb, { adminUserId: auth.userId, caseId, messageId });
    if (!res.ok) return fail(res.error);
    await audit(body.action, deleteReason ? { messageId, reason: deleteReason } : { messageId });
    return NextResponse.json({ ok: true });
  }

  return fail("invalid_action");
}
