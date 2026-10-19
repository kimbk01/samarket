import { redirect } from "next/navigation";
import { AdminChatDetailPage } from "@/components/admin/chats/AdminChatDetailPage";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { resolveTradeMessengerRoomForAdmin } from "@/lib/admin-chats/trade-messenger-room";
import { adminCmRoomDetailHref } from "@/lib/admin-community-messenger/room-domain-links";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * 레거시 거래 채팅 상세 (설계 §8) — 사용자 앱 방(CM)이 있으면 방 상세 1화면으로 보낸다.
 * CM 방이 없는 레거시 전용 방만 이 화면(읽기 전용 + 메모)에서 본다.
 */
export default async function AdminChatDetailRoute({ params, searchParams }: PageProps) {
  const { id } = await params;
  const sp = await searchParams;
  const returnTo = typeof sp.returnTo === "string" ? sp.returnTo : null;
  let cmRoomId: string | null = null;
  try {
    cmRoomId = (await resolveTradeMessengerRoomForAdmin(getSupabaseServer(), id)).messengerRoomId;
  } catch {
    cmRoomId = null;
  }
  if (cmRoomId) redirect(adminCmRoomDetailHref(cmRoomId, returnTo));
  return <AdminChatDetailPage roomId={id} />;
}
