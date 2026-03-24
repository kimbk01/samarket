/**
 * 채팅 미읽음 합계 (상단 편지 배지용)
 * GET /api/chat/unread-total — 세션(없으면 0)
 */
import { NextRequest, NextResponse } from "next/server";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { createClient } from "@supabase/supabase-js";
import { computeUserChatUnreadParts, sumUserChatUnread } from "@/lib/chat/user-chat-unread-parts";

export async function GET(_req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ total: 0 }, { status: 200 });
  }

  const userId = await getOptionalAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ total: 0 }, { status: 200 });
  }

  const sb = createClient(url, serviceKey, { auth: { persistSession: false } });
  const sbAny = sb as import("@supabase/supabase-js").SupabaseClient<any>;

  const parts = await computeUserChatUnreadParts(sbAny, userId);
  const total = sumUserChatUnread(parts);

  return NextResponse.json({ total });
}
