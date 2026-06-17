import "server-only";
import { getFriendshipSupabaseOrNull, trimFriendshipText } from "@/lib/community-messenger/friendship/friendship-utils";
import type { FriendshipProfileHydrator } from "@/lib/community-messenger/friendship/types";

export async function listCommunityMessengerAcceptedFriends(
  userId: string,
  hydrateProfiles: FriendshipProfileHydrator,
  listHiddenPeerIds: (viewerUserId: string) => Promise<string[]>
): Promise<
  Array<{ id: string; label: string; avatarUrl: string | null; friendshipAcceptedAt: string | null }>
> {
  const viewer = trimFriendshipText(userId);
  if (!viewer) return [];
  const sb = getFriendshipSupabaseOrNull();
  if (!sb) return [];
  const { data, error } = await (sb as any)
    .from("community_messenger_friendships")
    .select("requester_user_id, addressee_user_id, accepted_at")
    .eq("status", "accepted")
    .or(`requester_user_id.eq.${viewer},addressee_user_id.eq.${viewer}`)
    .order("accepted_at", { ascending: false });
  if (error) return [];
  const rows = (data ?? []) as Array<{
    requester_user_id?: string;
    addressee_user_id?: string;
    accepted_at?: string | null;
  }>;
  const acceptedAt = new Map<string, string | null>();
  const peerIds = [
    ...new Set(
      rows.map((row) => {
        const peer =
          trimFriendshipText(row.requester_user_id) === viewer
            ? trimFriendshipText(row.addressee_user_id)
            : trimFriendshipText(row.requester_user_id);
        if (peer) acceptedAt.set(peer, row.accepted_at ?? null);
        return peer;
      })
    ),
  ].filter(Boolean);
  const hiddenIds = new Set(await listHiddenPeerIds(viewer));
  const profiles = await hydrateProfiles(viewer, peerIds.filter((id) => !hiddenIds.has(id)));
  return profiles.map((profile) => ({
    ...profile,
    friendshipAcceptedAt: acceptedAt.get(profile.id) ?? null,
  }));
}
