import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { isUserJoinedMeetingMember } from "@/lib/meeting-open-chat/meeting-member-guard";
import { fetchViewerOpenChatIdentity } from "@/lib/meeting-open-chat/fetch-viewer-open-chat-identity";
import { enrichMeetingOpenChatRoomsListWithViewer } from "@/lib/meeting-open-chat/read-service";
import { ensureAndGetDefaultMeetingOpenChatRoomId, listMeetingOpenChatRoomsForMeeting } from "@/lib/meeting-open-chat/rooms-service";
import type { MeetingOpenChatRoomListEntry } from "@/lib/meeting-open-chat/types";

export type MeetingOpenChatListInitialData = {
  rooms: MeetingOpenChatRoomListEntry[];
  viewerSuggestedOpenNickname: string | null;
  viewerSuggestedRealname: string | null;
};

/**
 * 모임 오픈채팅 허브 첫 페인트용 서버 스냅샷.
 * 클라이언트 목록 fetch 전에도 방 목록이 바로 렌더되게 한다.
 */
export async function loadMeetingOpenChatListInitialData(
  meetingId: string
): Promise<MeetingOpenChatListInitialData | null> {
  const mid = meetingId?.trim() ?? "";
  if (!mid) return null;

  const userId = await getOptionalAuthenticatedUserId();
  if (!userId) return null;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return null;
  }

  try {
    if (!(await isUserJoinedMeetingMember(sb, mid, userId))) return null;

    await ensureAndGetDefaultMeetingOpenChatRoomId(sb, mid);

    const list = await listMeetingOpenChatRoomsForMeeting(sb, mid, { search: null });
    if (!list.ok) return null;

    const enriched = await enrichMeetingOpenChatRoomsListWithViewer(sb, list.rooms, userId);
    if (!enriched.ok) return null;

    const viewerIdentity = await fetchViewerOpenChatIdentity(sb, userId);

    return {
      rooms: enriched.rooms,
      viewerSuggestedOpenNickname: viewerIdentity.suggestedNickname,
      viewerSuggestedRealname: viewerIdentity.suggestedRealname,
    };
  } catch {
    return null;
  }
}
