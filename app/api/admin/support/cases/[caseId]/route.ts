import { NextRequest, NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
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
  listSupportMessages,
  markSupportCaseNotificationsRead,
  markSupportCaseReadForAdmin,
  reopenSupportCase,
} from "@/lib/support/support-case-service";
import type { SupportCasePriority, SupportCaseStatus } from "@/lib/support/support-case-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ caseId: string }> }
) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const { caseId } = await context.params;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  const gate = await getSupportCaseForAdmin(sb, caseId);
  if (!gate.ok) {
    const status = gate.error === "not_found" ? 404 : 400;
    return NextResponse.json({ ok: false, error: gate.error }, { status });
  }
  const messages = await listSupportMessages(sb, { caseId, includeInternal: true });
  if (!messages.ok) {
    return NextResponse.json({ ok: false, error: messages.error }, { status: 500 });
  }
  await markSupportCaseReadForAdmin(sb, caseId);
  // Phase 3 A3 — clear this admin's support_customer_replied bell rows for the case.
  const viewer = await requireAuthenticatedUserId();
  if (viewer.ok) await markSupportCaseNotificationsRead(sb, { userId: viewer.userId, caseId });
  // DEF-09: detail carries the same display-only identity fields as the queue, so the
  // header keeps the member name when the case is not in the current filtered list.
  const [displayCase] = await enrichSupportCasesForAdminDisplay(sb, [gate.case]);
  return NextResponse.json({ ok: true, case: displayCase ?? gate.case, messages: messages.messages });
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ caseId: string }> }
) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
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
    closeAfter?: boolean;
    messageId?: string;
    reason?: unknown;
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

  if (body.action === "reply") {
    const res = await adminReplySupportCase(sb, {
      adminUserId: auth.userId,
      caseId,
      body: String(body.body ?? ""),
      internalNote: body.internalNote === true,
      closeAfter: body.closeAfter === true,
    });
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: res.error }, { status: 400 });
    }
    await audit("reply", {
      internalNote: body.internalNote === true,
      closeAfter: body.closeAfter === true,
    });
    return NextResponse.json({ ok: true, message: res.message });
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
    const res = await adminUpdateSupportCaseStatus(sb, {
      adminUserId: auth.userId,
      caseId,
      status: body.status as SupportCaseStatus,
    });
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: res.error }, { status: 400 });
    }
    await audit("status", { status: body.status });
    return NextResponse.json({ ok: true, case: res.case });
  }

  if (body.action === "priority" && body.priority) {
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
