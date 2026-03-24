/**
 * 채팅방 메시지 목록 (서비스 롤)
 * GET /api/chat/room/[roomId]/messages (세션)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { createClient } from "@supabase/supabase-js";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ error: "서버 설정 필요" }, { status: 500 });
  }

  const { roomId } = await params;
  if (!roomId) {
    return NextResponse.json({ error: "roomId 필요" }, { status: 400 });
  }

  const sb = createClient(url, serviceKey, { auth: { persistSession: false } });
  const sbAny = sb as import("@supabase/supabase-js").SupabaseClient<any>;

  const { data: room } = await sbAny
    .from("product_chats")
    .select("id, seller_id, buyer_id")
    .eq("id", roomId)
    .maybeSingle();
  if (!room || (room.seller_id !== userId && room.buyer_id !== userId)) {
    return NextResponse.json({ error: "참여자가 아님" }, { status: 403 });
  }

  const { data: rows, error } = await sbAny
    .from("product_chat_messages")
    .select("*")
    .eq("product_chat_id", roomId)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const messages = (rows ?? [])
    .filter((m: Record<string, unknown>) => !(m.is_hidden === true))
    .map((m: Record<string, unknown>) => ({
      id: m.id,
      roomId: m.product_chat_id,
      senderId: m.sender_id,
      message: (m.content as string) ?? "",
      messageType: ((m.message_type as string) || "text") as "text" | "image" | "system",
      imageUrl: (m.image_url as string | null | undefined) ?? null,
      readAt: m.read_at ?? null,
      createdAt: (m.created_at as string) ?? "",
      isRead: !!m.read_at,
    }));

  return NextResponse.json(messages);
}
