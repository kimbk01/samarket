/**
 * 내가(구매자) 남긴 거래 후기 1건
 * GET /api/my/buyer-review?chatId=
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;
  const chatId = req.nextUrl.searchParams.get("chatId")?.trim();
  if (!chatId) {
    return NextResponse.json({ error: "chatId 필요" }, { status: 400 });
  }

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ error: "서버 설정 필요" }, { status: 500 });
  }
  const sbAny = sb as import("@supabase/supabase-js").SupabaseClient<any>;

  const { data: pc } = await sbAny
    .from("product_chats")
    .select("buyer_id")
    .eq("id", chatId)
    .maybeSingle();
  if (!pc || (pc as { buyer_id: string }).buyer_id !== userId) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  const { data: rev } = await sbAny
    .from("transaction_reviews")
    .select(
      "id, public_review_type, positive_tag_keys, negative_tag_keys, review_comment, is_anonymous_negative, created_at, reviewee_id"
    )
    .eq("room_id", chatId)
    .eq("reviewer_id", userId)
    .eq("role_type", "buyer_to_seller")
    .maybeSingle();

  if (!rev) {
    return NextResponse.json({ error: "후기가 없습니다." }, { status: 404 });
  }

  return NextResponse.json({ review: rev });
}
