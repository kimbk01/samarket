import { NextRequest, NextResponse } from "next/server";
import { requireChatAdmin } from "@/lib/admin/chat-admin/chat-admin-guards";
import { parseAdminChatCallsQuery } from "@/lib/admin/chat-admin/admin-chat-calls-url-state";
import { listAdminChatCalls } from "@/lib/admin-community-messenger/list-admin-call-sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/community-messenger/calls — 통화 기록·강제 종료 화면 (설계 §3-3, 읽기 전용).
 * Query: tab=active|records|audits · call_status · call_reason=failed · call_kind · window=24h|7d|30d ·
 * activity=7d · stuck=1 · q · cursor. 강제 종료는 `POST …/calls/{sessionId}/action` (시트 S4).
 */
export async function GET(req: NextRequest) {
  const admin = await requireChatAdmin();
  if (!admin.ok) return admin.response;
  try {
    const page = await listAdminChatCalls(parseAdminChatCallsQuery(req.nextUrl.searchParams));
    return NextResponse.json({ ok: true, ...page });
  } catch {
    return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
  }
}
