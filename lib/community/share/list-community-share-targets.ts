import type { CommunityShareTargetItem } from "@/components/community/share/CommunityShareTargetPicker";
import { listCommunityMessengerMyChatsAndGroups } from "@/lib/community-messenger/service";
import { listCommunityMessengerFriendsFromSsot } from "@/lib/community-messenger/friendship/list-community-messenger-friends-ssot";

export async function listCommunityShareTargets(userId: string): Promise<{
  recent: CommunityShareTargetItem[];
  friends: CommunityShareTargetItem[];
}> {
  const [{ chats, groups }, friendsResult] = await Promise.all([
    listCommunityMessengerMyChatsAndGroups(userId, { tier: "full", roomListCap: 30 }),
    listCommunityMessengerFriendsFromSsot(userId),
  ]);

  const roomRows = [...chats, ...groups].filter(
    (room) => room.roomStatus === "active" && !room.isArchivedByViewer && !room.isBlockedHiddenByViewer
  );

  const recent: CommunityShareTargetItem[] = roomRows.slice(0, 20).map((room) => ({
    id: `room:${room.id}`,
    kind: "room",
    /** 제목·부제가 모두 비면 빈 값 — 화면이 `chats_direct_chat_fallback` 키로 그림(영어 고정 「Chat」 제거) */
    label: room.title.trim() || room.subtitle?.trim() || "",
    subtitle: room.subtitle,
    avatarUrl: room.avatarUrl ?? null,
    roomId: room.id,
    /** 화면이 서버 대체 제목(「새 대화」·「그룹 N명」 등)을 보는 사람 언어로 다시 그릴 때 쓴다 (언어 사후 검토 M2) */
    roomType: room.roomType,
    forwardable:
      room.contextMeta?.kind !== "trade" &&
      room.contextMeta?.kind !== "delivery" &&
      room.chatDomain !== "trade" &&
      room.chatDomain !== "store_order",
  }));

  const friendProfiles = friendsResult.ok ? friendsResult.friends : [];
  const friends: CommunityShareTargetItem[] = friendProfiles.map((profile) => ({
    id: `friend:${profile.id}`,
    kind: "friend",
    label: profile.label.trim() || profile.subtitle?.trim() || "",
    subtitle: profile.subtitle,
    avatarUrl: profile.avatarUrl ?? null,
    userId: profile.id,
    forwardable: true,
  }));

  return { recent, friends };
}
