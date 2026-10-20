import { NextRequest, NextResponse } from "next/server";
import { requireChatAdmin, requireChatRoomAdmin, requireTradeChatAdmin } from "@/lib/admin/chat-admin/chat-admin-guards";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { listChatReportQueue } from "@/lib/admin-chat-reports/list-chat-report-queue";
import { parseChatReportQueueQuery } from "@/lib/admin/chat-admin/admin-chat-report-queue-model";
import { parseAdminListPage } from "@/lib/admin/pagination/parse-admin-list-page";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 한 페이지 최대 건수 (AdminPagination 20/50/100). */
const CHAT_REPORT_QUEUE_MAX_LIMIT = 100;

/**
 * GET /api/admin/chat/report-queue — 채팅 신고 단일 큐 (O-C10, 읽기 전용).
 * Query: type=all|messenger|trade_chat|trade_report · status=open|received|reviewing|resolved|dismissed|all ·
 * target=<room or member uuid> · q · sort=oldest|newest · domain · limit · offset. 조치는 `POST …/report-queue/action`.
 * 응답: `{ ok, rows, total, limit, offset, nextCursor: null, failedSources }` — R7 서버 페이지(DB 한 번 병합).
 * 예전 `cursor` 파라미터는 무시한다 (첫 페이지부터 · offset 기준).
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const query = parseChatReportQueueQuery(sp);
  // 거래 방 신고만 보는 큐(domain=trade)는 거래 Admin O-2: 활성 관리자 전원 (D-41)
  const admin = query.target
    ? await requireTargetScopedAdmin(query.target)
    : query.domain === "trade"
      ? await requireTradeChatAdmin()
      : await requireChatAdmin();
  if (!admin.ok) return admin.response;

  try {
    const page = parseAdminListPage(sp, { defaultLimit: 20, maxLimit: CHAT_REPORT_QUEUE_MAX_LIMIT });
    const result = await listChatReportQueue(query, page);
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
  }
}

/**
 * 대상(방) 한정 조회 — 도메인 화면(주문 채팅 뷰어·거래 상세)에서 「이 방의 신고」로 들어온 경우
 * 방 유형 권한(거래 `products` · 배달 `business`)으로도 볼 수 있다 (설계 §2-2). 회원 대상·그 외는 `chats`.
 */
async function requireTargetScopedAdmin(target: string) {
  const sb = getSupabaseServer();
  const { data: cm } = await sb.from("community_messenger_rooms").select("id").eq("id", target).maybeSingle();
  if (cm) return requireChatRoomAdmin(target);
  const [{ data: cr }, { data: pc }] = await Promise.all([
    sb.from("chat_rooms").select("id").eq("id", target).maybeSingle(),
    sb.from("product_chats").select("id").eq("id", target).maybeSingle(),
  ]);
  if (cr || pc) return requireTradeChatAdmin();
  return requireChatAdmin();
}
