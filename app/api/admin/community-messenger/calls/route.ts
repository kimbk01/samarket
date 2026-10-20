import { NextRequest, NextResponse } from "next/server";
import { requireChatAdmin } from "@/lib/admin/chat-admin/chat-admin-guards";
import { parseAdminChatCallsQuery } from "@/lib/admin/chat-admin/admin-chat-calls-url-state";
import { listAdminChatCalls } from "@/lib/admin-community-messenger/list-admin-call-sessions";
import { normalizeAdminListPageSize } from "@/lib/admin/list-query/admin-list-query";
import { parseAdminListPage } from "@/lib/admin/pagination/parse-admin-list-page";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/community-messenger/calls — 통화 기록·강제 종료 화면 (설계 §3-3, 읽기 전용).
 * Query: tab=active|records|audits · call_status · call_reason=failed · call_kind · window=24h|7d|30d ·
 * activity=7d · stuck=1 · q · cursor. 강제 종료는 `POST …/calls/{sessionId}/action` (시트 S4).
 * 쪽 번호 (R7 목록 표준): `offset` 이 있으면 `limit`(20/50/100, 그 외 20)·`offset` → 응답에 `total`·`limit`·`offset`.
 * `offset` 이 없으면 기존 keyset(진행 중 탭 상한 100) 응답 그대로.
 */
export async function GET(req: NextRequest) {
  const admin = await requireChatAdmin();
  if (!admin.ok) return admin.response;
  try {
    const sp = req.nextUrl.searchParams;
    const query = parseAdminChatCallsQuery(sp);
    if (sp.has("offset")) {
      const limit = normalizeAdminListPageSize(sp.get("limit"));
      const { offset } = parseAdminListPage(sp);
      const page = await listAdminChatCalls(query, { limit, offset });
      return NextResponse.json({ ok: true, ...page, total: page.total ?? 0, limit, offset });
    }
    const page = await listAdminChatCalls(query);
    return NextResponse.json({ ok: true, ...page });
  } catch {
    return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
  }
}
