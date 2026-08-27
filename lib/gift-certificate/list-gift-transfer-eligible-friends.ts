import type { SupabaseClient } from "@supabase/supabase-js";
import { listCommunityMessengerFriendsFromSsot } from "@/lib/community-messenger/friendship/list-community-messenger-friends-ssot";
import type { CommunityMessengerProfileLite } from "@/lib/community-messenger/types";
import { fetchBlockedAuthorIdsForViewerSb } from "@/lib/social/user-block-ssot";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

type ProfileStatusRow = {
  id: string;
  status?: string | null;
  deleted_at?: string | null;
};

export type GiftTransferEligibleFriendsDeps = {
  listFriends: (viewerUserId: string) => Promise<CommunityMessengerProfileLite[]>;
  fetchBlockedIds: (viewerUserId: string) => Promise<Set<string>>;
  fetchProfileStatuses: (userIds: string[]) => Promise<Map<string, ProfileStatusRow>>;
};

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecipientActive(row: ProfileStatusRow | undefined): boolean {
  const status = trimText(row?.status).toLowerCase();
  if (trimText(row?.deleted_at)) return false;
  return status !== "suspended" && status !== "deleted" && status !== "banned" && status !== "kicked";
}

async function fetchProfileStatusesFromSb(
  sb: SupabaseClient<any>,
  userIds: string[]
): Promise<Map<string, ProfileStatusRow>> {
  if (!userIds.length) return new Map();
  const { data } = await sb.from("profiles").select("id, status, deleted_at").in("id", userIds);
  return new Map(
    ((data ?? []) as ProfileStatusRow[])
      .map((row) => [trimText(row.id), row] as const)
      .filter(([id]) => Boolean(id))
  );
}

function createDefaultDeps(): GiftTransferEligibleFriendsDeps | null {
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return null;
  return {
    listFriends: (viewerUserId) => listCommunityMessengerFriendsFromSsot(viewerUserId),
    fetchBlockedIds: (viewerUserId) => fetchBlockedAuthorIdsForViewerSb(sb, viewerUserId),
    fetchProfileStatuses: (userIds) => fetchProfileStatusesFromSb(sb, userIds),
  };
}

export async function listGiftTransferEligibleFriends(
  viewerUserId: string,
  deps: GiftTransferEligibleFriendsDeps | null = createDefaultDeps()
): Promise<CommunityMessengerProfileLite[]> {
  const viewer = trimText(viewerUserId);
  if (!viewer || !deps) return [];

  const friends = await deps.listFriends(viewer);
  const candidateIds = friends
    .map((friend) => trimText(friend.id))
    .filter((id) => id && id !== viewer);
  if (!candidateIds.length) return [];

  const [blockedIds, profileStatuses] = await Promise.all([
    deps.fetchBlockedIds(viewer),
    deps.fetchProfileStatuses(candidateIds),
  ]);

  return friends.filter((friend) => {
    const id = trimText(friend.id);
    if (!id || id === viewer) return false;
    if (friend.isFriend === false || friend.isHiddenFriend === true) return false;
    if (blockedIds.has(id) || friend.blocked === true) return false;
    return isRecipientActive(profileStatuses.get(id));
  });
}
