import { notFound, redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

interface Props {
  params: Promise<{ meetingId: string }>;
}

/** 모임에 연결된 메신저 방 id — 조회 실패(서비스 키 없음 등)는 빈 값 */
async function loadMeetingRoomId(meetingId: string): Promise<string> {
  try {
    const sb = getSupabaseServer();
    const { data } = await sb
      .from("meetings")
      .select("community_messenger_room_id")
      .eq("id", meetingId)
      .maybeSingle();
    return String(
      (data as { community_messenger_room_id?: string | null } | null)?.community_messenger_room_id ?? ""
    ).trim();
  } catch {
    return "";
  }
}

/**
 * 레거시 URL `/philife/meetings/[id]` — 모임 UX는 메신저에서만 제공한다.
 * room 이 연결되어 있으면 채팅방으로, 없으면 모임 탭 + meetingId 쿼리로 넘긴다.
 *
 * C5 (Owner 「C5 구현 승인」 2026-11-09): 이전에는 `redirect()` 가 try 안에 있어 catch 가 이동 신호(NEXT_REDIRECT)를
 * 삼켜, 방이 있어도 항상 아래 기본 화면으로 갔다. 조회만 try 안에서 하고 이동은 try 밖에서 한다.
 */
export default async function PhilifeMeetingRedirectPage({ params }: Props) {
  const { meetingId } = await params;
  const id = meetingId?.trim();
  if (!id) notFound();

  const roomId = await loadMeetingRoomId(id);
  if (roomId) {
    redirect(`/community-messenger/rooms/${encodeURIComponent(roomId)}`);
  }

  redirect(`/community-messenger?section=open_chat&meetingId=${encodeURIComponent(id)}`);
}
