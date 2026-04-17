/**
 * POST /api/me/chats/mark-trade-read
 * 거래 채널(item_trade + 레거시 product_chats)만 읽음 — 하단 거래 탭 `chatUnread` 범위.
 */
import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { clientSafeInternalErrorMessage } from "@/lib/http/api-route";
import { markTradeChatChannelsReadForUser } from "@/lib/chats/mark-trade-chats-read-for-user";

export const dynamic = "force-dynamic";

export async function POST() {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "서버 설정 필요" }, { status: 500 });
  }
  const sbAny = sb as import("@supabase/supabase-js").SupabaseClient<any>;

  const result = await markTradeChatChannelsReadForUser(sbAny, userId);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: clientSafeInternalErrorMessage(result.error) },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
