import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  getSupportCaseForUser,
  listSupportMessages,
  markSupportCaseNotificationsRead,
  markSupportCaseReadForRequester,
  postRequesterSupportMessage,
  requesterCloseSupportCase,
} from "@/lib/support/support-case-service";
import { isSupportTicketClosedStatus } from "@/lib/support/support-ticket-form";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ caseId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const { caseId } = await context.params;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  const gate = await getSupportCaseForUser(sb, { userId: auth.userId, caseId });
  if (!gate.ok) {
    const status = gate.error === "not_found" ? 404 : gate.error === "forbidden" ? 403 : 400;
    return NextResponse.json({ ok: false, error: gate.error }, { status });
  }
  // 접수형 문의(Owner 2026-11-10): 종료된 문의는 요청자에게 내용을 돌려주지 않는다(화면에서 사라짐).
  // 고객 문의 SSOT §3-1 (F3, Owner 2026-11-27): 단, 고객이 아직 안 읽은 답변이 있으면 이번 한 번은 내용을 돌려주고
  // 읽음 처리한다 → 그 뒤로는 사라진다.
  if (isSupportTicketClosedStatus(gate.case.status) && Number(gate.case.requester_unread_count ?? 0) > 0) {
    const closedMessages = await listSupportMessages(sb, { caseId });
    if (!closedMessages.ok) {
      return NextResponse.json({ ok: false, error: closedMessages.error }, { status: 500 });
    }
    await markSupportCaseReadForRequester(sb, {
    userId: auth.userId,
    caseId,
    // 2차 재감사 E: 돌려준 글 목록 기준 시각 — 그 뒤 새 답변이 왔으면 읽음 0 으로 만들지 않는다
    seenLastMessageAt: gate.case.last_message_at,
  });
    const notificationsRead = await markSupportCaseNotificationsRead(sb, { userId: auth.userId, caseId });
    return NextResponse.json({
      ok: true,
      case: gate.case,
      messages: closedMessages.messages,
      closed: true,
      notificationsRead,
    });
  }
  if (isSupportTicketClosedStatus(gate.case.status)) {
    const notificationsRead = await markSupportCaseNotificationsRead(sb, {
      userId: auth.userId,
      caseId,
    });
    return NextResponse.json({ ok: true, case: gate.case, messages: [], closed: true, notificationsRead });
  }
  const messages = await listSupportMessages(sb, { caseId });
  if (!messages.ok) {
    return NextResponse.json({ ok: false, error: messages.error }, { status: 500 });
  }
  await markSupportCaseReadForRequester(sb, {
    userId: auth.userId,
    caseId,
    // 2차 재감사 E: 돌려준 글 목록 기준 시각 — 그 뒤 새 답변이 왔으면 읽음 0 으로 만들지 않는다
    seenLastMessageAt: gate.case.last_message_at,
  });
  // Phase 3 A3 — reading the case also clears its bell rows for this requester.
  const notificationsRead = await markSupportCaseNotificationsRead(sb, {
    userId: auth.userId,
    caseId,
  });
  return NextResponse.json({
    ok: true,
    case: gate.case,
    messages: messages.messages,
    notificationsRead,
  });
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ caseId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const { caseId } = await context.params;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    body?: string;
    action?: string;
    /** 2차 재감사 A: 「확인했어요」 때 화면이 본 문의 last_message_at */
    seenLastMessageAt?: string | null;
  };

  // 접수형 문의 — 고객이 답변 확인 후 「확인했어요」 = 종료(알림 없음)
  if (body.action === "close") {
    const res = await requesterCloseSupportCase(sb, {
      userId: auth.userId,
      caseId,
      seenLastMessageAt: typeof body.seenLastMessageAt === "string" ? body.seenLastMessageAt : null,
    });
    if (!res.ok) {
      const status =
        res.error === "not_found"
          ? 404
          : res.error === "forbidden"
            ? 403
            : res.error === "status_conflict" || res.error === "case_updated"
              ? 409
              : 400;
      return NextResponse.json({ ok: false, error: res.error }, { status });
    }
    return NextResponse.json({ ok: true, case: res.case });
  }

  // 고객 문의 SSOT §2 (재감사 D12): 재오픈은 어드민만 — 고객은 「새 문의」로 다시 묻는다. 옛 호출은 400.
  if (body.action === "reopen") {
    return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });
  }

  const res = await postRequesterSupportMessage(sb, {
    userId: auth.userId,
    caseId,
    body: String(body.body ?? ""),
  });
  if (!res.ok) {
    const status =
      res.error === "case_closed"
        ? 409
        : res.error === "forbidden"
          ? 403
          : res.error === "not_found"
            ? 404
            : 400;
    return NextResponse.json({ ok: false, error: res.error }, { status });
  }
  return NextResponse.json({ ok: true, message: res.message });
}
