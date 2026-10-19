import { NextRequest, NextResponse } from "next/server";
import { requireChatAdmin } from "@/lib/admin/chat-admin/chat-admin-guards";
import { listChatReportQueue } from "@/lib/admin-chat-reports/list-chat-report-queue";
import { clampAdminChatListLimit } from "@/lib/admin/chat-admin/admin-chat-list-url-state";
import { parseChatReportQueueQuery } from "@/lib/admin/chat-admin/admin-chat-report-queue-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/chat/report-queue — 채팅 신고 단일 큐 (O-C10, 읽기 전용).
 * Query: type=all|messenger|trade_chat|trade_report · status=open|received|reviewing|resolved|dismissed|all ·
 * target=<room or member uuid> · cursor · limit. 조치는 출처별 기존 action API.
 */
export async function GET(req: NextRequest) {
  const admin = await requireChatAdmin();
  if (!admin.ok) return admin.response;

  const sp = req.nextUrl.searchParams;
  try {
    const page = await listChatReportQueue(parseChatReportQueueQuery(sp), clampAdminChatListLimit(sp.get("limit")));
    return NextResponse.json({ ok: true, ...page });
  } catch {
    return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
  }
}
