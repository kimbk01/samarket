import type { CommunityShareTargetItem } from "@/components/community/share/CommunityShareTargetPicker";
import { listCommunityMessengerMyChatsAndGroups } from "@/lib/community-messenger/service";
import { listCommunityMessengerFriendsFromSsot } from "@/lib/community-messenger/friendship/list-community-messenger-friends-ssot";

export async function listCommunityShareTargets(userId: string): Promise<{
  recent: CommunityShareTargetItem[];
  friends: CommunityShareTargetItem[];
}> {
  const [{ chats, groups }, friendProfiles] = await Promise.all([
    listCommunityMessengerMyChatsAndGroups(userId, { tier: "full", roomListCap: 30 }),
    listCommunityMessengerFriendsFromSsot(userId),
  ]);

  const roomRows = [...chats, ...groups].filter(
    (room) => room.roomStatus === "active" && !room.isArchivedByViewer && !room.isBlockedHiddenByViewer
  );

  const recent: CommunityShareTargetItem[] = roomRows.slice(0, 20).map((room) => ({
    id: `room:${room.id}`,
    kind: "room",
    label: room.title.trim() || room.subtitle?.trim() || "Chat",
    subtitle: room.subtitle,
    avatarUrl: room.avatarUrl ?? null,
    roomId: room.id,
  }));

  const friends: CommunityShareTargetItem[] = friendProfiles.map((profile) => ({
    id: `friend:${profile.id}`,
    kind: "friend",
    label: profile.label.trim() || profile.subtitle?.trim() || "",
    subtitle: profile.subtitle,
    avatarUrl: profile.avatarUrl ?? null,
    userId: profile.id,
  }));

  return { recent, friends };
}
