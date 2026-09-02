import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  getSupportCaseForUser,
  listSupportMessages,
  markSupportCaseReadForRequester,
  postRequesterSupportMessage,
  reopenSupportCase,
} from "@/lib/support/support-case-service";

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
  const messages = await listSupportMessages(sb, { caseId });
  if (!messages.ok) {
    return NextResponse.json({ ok: false, error: messages.error }, { status: 500 });
  }
  await markSupportCaseReadForRequester(sb, { userId: auth.userId, caseId });
  return NextResponse.json({ ok: true, case: gate.case, messages: messages.messages });
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
