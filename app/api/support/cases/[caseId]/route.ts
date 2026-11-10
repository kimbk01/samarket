import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  getSupportCaseForUser,
  listSupportMessages,
  markSupportCaseNotificationsRead,
  markSupportCaseReadForRequester,
  postRequesterSupportMessage,
  reopenSupportCase,
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
  await markSupportCaseReadForRequester(sb, { userId: auth.userId, caseId });
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
  };

  // 접수형 문의 — 고객이 답변 확인 후 「확인했어요」 = 종료(알림 없음)
  if (body.action === "close") {
    const res = await requesterCloseSupportCase(sb, { userId: auth.userId, caseId });
    if (!res.ok) {
      const status =
        res.error === "not_found"
          ? 404
          : res.error === "forbidden"
            ? 403
            : res.error === "status_conflict"
              ? 409
              : 400;
      return NextResponse.json({ ok: false, error: res.error }, { status });
    }
    return NextResponse.json({ ok: true, case: res.case });
  }

  if (body.action === "reopen") {
    const res = await reopenSupportCase(sb, { userId: auth.userId, caseId });
    if (!res.ok) {
      const status = res.error === "not_found" ? 404 : res.error === "forbidden" ? 403 : 400;
      return NextResponse.json({ ok: false, error: res.error }, { status });
    }
    return NextResponse.json({ ok: true, case: res.case });
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
