import { notFound, redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

interface Props {
  params: Promise<{ meetingId: string }>;
}

/**
 * 레거시 URL `/philife/meetings/[id]` — 모임 UX는 메신저에서만 제공한다.
 * room 이 연결되어 있으면 채팅방으로, 없으면 모임 탭 + meetingId 쿼리로 넘긴다.
 */
export default async function PhilifeMeetingRedirectPage({ params }: Props) {
  const { meetingId } = await params;
  const id = meetingId?.trim();
  if (!id) notFound();

  try {
    const sb = getSupabaseServer();
    const { data } = await sb.from("meetings").select("community_messenger_room_id").eq("id", id).maybeSingle();
    const roomId = String((data as { community_messenger_room_id?: string | null } | null)?.community_messenger_room_id ?? "").trim();
    if (roomId) {
      redirect(`/community-messenger/rooms/${encodeURIComponent(roomId)}`);
    }
  } catch {
    /* 서비스 키 없음 등 — 아래 폴백 */
  }

  redirect(`/philife?category=meetup&meetingId=${encodeURIComponent(id)}`);
}
