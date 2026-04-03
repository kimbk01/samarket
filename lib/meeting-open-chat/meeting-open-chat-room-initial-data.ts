import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { isUserJoinedMeetingMember } from "@/lib/community-meeting-open-chat/meeting-member-guard";
import { fetchViewerSuggestedOpenNickname } from "@/lib/meeting-open-chat/fetch-viewer-suggested-open-nickname";
import type {
  MeetingOpenChatRoomInitialChatMember,
  MeetingOpenChatRoomInitialData,
} from "@/lib/meeting-open-chat/meeting-open-chat-room-initial-types";
import { listMeetingOpenChatMessages } from "@/lib/meeting-open-chat/messages-service";
import { getActiveMeetingOpenChatMember } from "@/lib/meeting-open-chat/room-access";
import { getMeetingOpenChatUnreadOthersCount } from "@/lib/meeting-open-chat/read-service";
import { getMeetingOpenChatRoomInMeeting } from "@/lib/meeting-open-chat/rooms-service";
import type { MeetingOpenChatMessagePublic } from "@/lib/meeting-open-chat/types";

export type { MeetingOpenChatRoomInitialData } from "@/lib/meeting-open-chat/meeting-open-chat-room-initial-types";

/**
 * 로그인·모임 멤버·방 조회가 성공할 때만 스냅샷을 반환.
 * 그 외(미로그인·403·404 등)는 null → 클라이언트가 기존 API로 처리.
 */
export async function loadMeetingOpenChatRoomInitialData(
  meetingId: string,
  roomId: string
): Promise<MeetingOpenChatRoomInitialData | null> {
  const mid = meetingId?.trim() ?? "";
  const rid = roomId?.trim() ?? "";
  if (!mid || !rid) return null;

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

    const room = await getMeetingOpenChatRoomInMeeting(sb, mid, rid);
    if (!room.ok) return null;

    const memberRes = await getActiveMeetingOpenChatMember(sb, rid, userId);
    const chatMember: MeetingOpenChatRoomInitialChatMember | null = memberRes.ok
      ? {
          memberId: memberRes.member.memberId,
          role: memberRes.member.role,
          openNickname: memberRes.member.open_nickname,
          openProfileImageUrl: memberRes.member.open_profile_image_url,
        }
      : null;

    let viewerUnreadCount = 0;
    let initialMessages: MeetingOpenChatMessagePublic[] | undefined;

    if (chatMember && memberRes.ok) {
      const viewerRole = memberRes.member.role;
      const [ur, list] = await Promise.all([
        getMeetingOpenChatUnreadOthersCount(sb, rid, userId),
        listMeetingOpenChatMessages(sb, {
          roomId: rid,
          viewerRole,
          limit: 50,
          before: null,
          search: null,
        }),
      ]);
      if (ur.ok) viewerUnreadCount = ur.count;
      if (list.ok) initialMessages = list.messages;
    }

    const viewerSuggestedOpenNickname = chatMember
      ? null
      : await fetchViewerSuggestedOpenNickname(sb, userId);

    return {
      room: room.room,
      chatMember,
      viewerUnreadCount,
      viewerSuggestedOpenNickname,
      ...(initialMessages !== undefined ? { initialMessages } : {}),
    };
  } catch {
    return null;
  }
}
