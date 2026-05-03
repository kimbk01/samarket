import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";

/** 부트스트랩 전 입력창·셸만 올리기 위한 클라이언트 전용 스냅샷(서버와 무관). */
export function buildClientShellPlaceholderSnapshot(
  roomId: string,
  /** RSC `initialViewerUserId` 등 — 없으면 `undefined` 로 두고 스냅샷 필드는 빈 문자열. */
  viewerUserId?: string
): CommunityMessengerRoomSnapshot {
  const id = String(roomId ?? "").trim();
  const uid = viewerUserId?.trim();
  const now = new Date().toISOString();
  return {
    clientShellPlaceholder: true,
    viewerUserId: uid ?? "",
    room: {
      id,
      roomType: "direct",
      roomStatus: "active",
      visibility: "private",
      joinPolicy: "invite_only",
      identityPolicy: "alias_allowed",
      isReadonly: false,
      title: "",
      subtitle: "",
      summary: "",
      avatarUrl: null,
      unreadCount: 0,
      lastMessage: "",
      lastMessageAt: now,
      memberCount: 0,
      ownerUserId: null,
      ownerLabel: "",
      memberLimit: null,
      isDiscoverable: false,
      requiresPassword: false,
      allowMemberInvite: false,
      description: "",
    },
    members: [],
    messages: [],
    myRole: "member",
    activeCall: null,
  };
}
