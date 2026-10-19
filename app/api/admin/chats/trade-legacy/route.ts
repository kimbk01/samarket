import { NextResponse } from "next/server";
import { requireAnyAdminPermission } from "@/lib/admin/chat-admin/chat-admin-guards";
import { TRADE_CHAT_ADMIN_PERMISSION_KEYS } from "@/lib/admin/chat-admin/chat-content-access-policy";
import { loadLegacyOnlyTradeChats } from "@/lib/admin-chats/legacy-only-trade-chats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/chats/trade-legacy — 앱 채팅방(CM)이 없는 과거 거래 채팅 (설계 §3-6).
 * `{ count, productChatIds, chatRoomIds }` — 채팅방 목록 안내 줄 건수와 레거시 거래 기록 화면 행이 같은 판정.
 */
export async function GET() {
  const admin = await requireAnyAdminPermission(TRADE_CHAT_ADMIN_PERMISSION_KEYS);
  if (!admin.ok) return admin.response;
  try {
    return NextResponse.json({ ok: true, ...(await loadLegacyOnlyTradeChats(admin.sb)) });
  } catch {
    return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
  }
}
