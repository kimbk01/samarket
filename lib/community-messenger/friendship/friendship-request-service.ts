import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { COMMUNITY_MESSENGER_FRIENDSHIP_READD_BLOCK_MS } from "@/lib/community-messenger/friendship/constants";
import { assertCanAddFriend } from "@/lib/community-messenger/friendship/friendship-permission-guards";
import { loadFriendshipRow } from "@/lib/community-messenger/friendship/friendship-repository";
import {
  friendshipNowIso,
  getFriendshipSupabaseOrNull,
  trimFriendshipText,
} from "@/lib/community-messenger/friendship/friendship-utils";
import type {
  FriendshipActionResult,
  FriendshipDirectRoomEnsurer,
  FriendshipProfileHydrator,
} from "@/lib/community-messenger/friendship/types";
import { addFriendSaved } from "@/lib/community-messenger/social-relations";
import {
  notifyCommunityMessengerFriendRequestAccepted,
  notifyCommunityMessengerFriendRequestReceived,
} from "@/lib/notifications/community-messenger-friend-inapp-notify";

async function notifyFriendRequestReceived(
  sb: SupabaseClient<any>,
  args: {
    friendshipId: string;
    requesterUserId: string;
    addresseeUserId: string;
    hydrateProfiles: FriendshipProfileHydrator;
  }
): Promise<void> {
  const profiles = await args.hydrateProfiles(args.requesterUserId, [args.requesterUserId]);
  const requesterLabel = profiles[0]?.label ?? args.requesterUserId;
  await notifyCommunityMessengerFriendRequestReceived(sb, {
    addresseeUserId: args.addresseeUserId,
    requestId: args.friendshipId,
    requesterUserId: args.requesterUserId,
    requesterLabel,
  });
}

async function notifyFriendRequestAccepted(
  sb: SupabaseClient<any>,
  args: {
    friendshipId: string;
    requesterUserId: string;
    addresseeUserId: string;
    hydrateProfiles: FriendshipProfileHydrator;
  }
): Promise<void> {
  const profiles = await args.hydrateProfiles(args.addresseeUserId, [args.addresseeUserId]);
  const addresseeLabel = profiles[0]?.label ?? args.addresseeUserId;
  await notifyCommunityMessengerFriendRequestAccepted(sb, {
    requesterUserId: args.requesterUserId,
    requestId: args.friendshipId,
    addresseeUserId: args.addresseeUserId,
    addresseeLabel,
  });
}

export async function requestCommunityMessengerFriendship(input: {
  userId: string;
  targetUserId: string;
  ensureDirectRoom: FriendshipDirectRoomEnsurer;
  hydrateProfiles: FriendshipProfileHydrator;
}): Promise<FriendshipActionResult> {
  const requester = trimFriendshipText(input.userId);
  const target = trimFriendshipText(input.targetUserId);
  if (!requester || !target || requester === target) return { ok: false, error: "bad_target" };
  console.info("[friend-flow] request_start", { requesterUserId: requester, targetUserId: target });

  const gate = await assertCanAddFriend({ viewerUserId: requester, peerUserId: target });
  if (!gate.ok) {
    if (gate.error === "already_friend") {
      const sb = getFriendshipSupabaseOrNull();
      const existing = sb ? await loadFriendshipRow(sb, requester, target) : null;
      return { ok: true, friendshipId: existing?.id, targetUserId: target };
    }
    if (gate.error === "readd_blocked") {
      return { ok: false, error: "readd_blocked", readdBlockedUntil: gate.readdBlockedUntil ?? null };
    }
    if (gate.error === "already_pending") {
      const sb = getFriendshipSupabaseOrNull();
      const existing = sb ? await loadFriendshipRow(sb, requester, target) : null;
      return { ok: false, error: "already_requested", friendshipId: existing?.id };
    }
    return { ok: false, error: gate.error === "blocked" ? "blocked_target" : "bad_target" };
  }

  const sb = getFriendshipSupabaseOrNull();
  if (!sb) return { ok: false, error: "server_unavailable" };
  const now = friendshipNowIso();
  const existing = await loadFriendshipRow(sb, requester, target);

  if (existing?.id) {
    if (existing.status === "pending") {
      const incomingFromTarget = existing.requesterUserId === target && existing.addresseeUserId === requester;
      if (incomingFromTarget) {
        return acceptCommunityMessengerFriendship({
          userId: requester,
          friendshipId: existing.id,
          ensureDirectRoom: input.ensureDirectRoom,
          hydrateProfiles: input.hydrateProfiles,
        });
      }
      return { ok: false, error: "already_requested", friendshipId: existing.id };
    }
    const { data, error } = await (sb as any)
      .from("community_messenger_friendships")
      .update({
        requester_user_id: requester,
        addressee_user_id: target,
        status: "pending",
        blocked_by_user_id: null,
        updated_at: now,
        removed_at: null,
      })
      .eq("id", existing.id)
      .eq("status", "removed")
      .select("id")
      .maybeSingle();
    if (error) return { ok: false, error: String(error.message ?? "friend_request_failed") };
    if (!data?.id) return { ok: false, error: "friend_request_failed" };
    void notifyFriendRequestReceived(sb as SupabaseClient<any>, {
      friendshipId: existing.id,
      requesterUserId: requester,
      addresseeUserId: target,
      hydrateProfiles: input.hydrateProfiles,
    });
    console.info("[friend-flow] request_done", { requesterUserId: requester, targetUserId: target, friendshipId: existing.id });
    return { ok: true, friendshipId: existing.id, targetUserId: target };
  }

  const { data, error } = await (sb as any)
    .from("community_messenger_friendships")
    .insert({
      requester_user_id: requester,
      addressee_user_id: target,
      status: "pending",
      created_at: now,
      updated_at: now,
    })
    .select("id")
    .single();
  if (error) {
    if (String(error.code) === "23505") {
      const raced = await loadFriendshipRow(sb, requester, target);
      if (raced?.status === "pending") {
        return { ok: false, error: "already_requested", friendshipId: raced.id };
      }
    }
    return { ok: false, error: String(error.message ?? "friend_request_failed") };
  }
  const friendshipId = trimFriendshipText((data as { id?: string } | null)?.id);
  void notifyFriendRequestReceived(sb as SupabaseClient<any>, {
    friendshipId,
    requesterUserId: requester,
    addresseeUserId: target,
    hydrateProfiles: input.hydrateProfiles,
  });
  console.info("[friend-flow] request_done", { requesterUserId: requester, targetUserId: target, friendshipId });
  return { ok: true, friendshipId, targetUserId: target };
}

export async function acceptCommunityMessengerFriendship(input: {
  userId: string;
  friendshipId: string;
  ensureDirectRoom: FriendshipDirectRoomEnsurer;
  hydrateProfiles: FriendshipProfileHydrator;
}): Promise<FriendshipActionResult> {
  const viewer = trimFriendshipText(input.userId);
  const fid = trimFriendshipText(input.friendshipId);
  if (!viewer || !fid) return { ok: false, error: "bad_request" };
  console.info("[friend-flow] accept_start", { viewerUserId: viewer, friendshipId: fid });
  const sb = getFriendshipSupabaseOrNull();
  if (!sb) return { ok: false, error: "server_unavailable" };

  const { data: row, error: rowError } = await (sb as any)
    .from("community_messenger_friendships")
    .select("id, requester_user_id, addressee_user_id, status")
    .eq("id", fid)
    .maybeSingle();
  if (rowError) return { ok: false, error: String(rowError.message ?? "friendship_lookup_failed") };
  const r = row as { requester_user_id?: string; addressee_user_id?: string; status?: string } | null;
  if (!r) return { ok: false, error: "friendship_not_found" };
  if (trimFriendshipText(r.addressee_user_id) !== viewer) return { ok: false, error: "forbidden" };
  if (r.status !== "pending") return { ok: false, error: "friendship_not_pending" };

  const requester = trimFriendshipText(r.requester_user_id);
  const addressee = trimFriendshipText(r.addressee_user_id);
  const now = friendshipNowIso();
  const roomOut = await input.ensureDirectRoom(addressee, requester);
  if (!roomOut.ok || !roomOut.roomId) return { ok: false, error: roomOut.error ?? "room_failed" };

  const { data: updated, error: updateError } = await (sb as any)
    .from("community_messenger_friendships")
    .update({ status: "accepted", accepted_at: now, updated_at: now, blocked_by_user_id: null })
    .eq("id", fid)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (updateError || !updated?.id) return { ok: false, error: "friendship_not_pending" };

  await Promise.all([
    (sb as any)
      .from("community_messenger_rooms")
      .update({ relation_status: "accepted", accepted_at: now, updated_at: now })
      .eq("id", roomOut.roomId),
    (sb as any)
      .from("community_messenger_participants")
      .update({ hidden_at: null, blocked_hidden_at: null, declined_hidden_at: null })
      .eq("room_id", roomOut.roomId),
    addFriendSaved(requester, addressee),
    addFriendSaved(addressee, requester),
  ]);

  void notifyFriendRequestAccepted(sb as SupabaseClient<any>, {
    friendshipId: fid,
    requesterUserId: requester,
    addresseeUserId: addressee,
    hydrateProfiles: input.hydrateProfiles,
  });
  console.info("[friend-flow] accept_done", { viewerUserId: viewer, friendshipId: fid, roomId: roomOut.roomId });
  console.info("[friend-flow] friend_list_invalidated", { viewerUserId: viewer, targetUserId: requester });
  return { ok: true, friendshipId: fid, roomId: roomOut.roomId, targetUserId: requester };
}

export async function declineCommunityMessengerFriendship(
  userId: string,
  friendshipId: string
): Promise<FriendshipActionResult> {
  const viewer = trimFriendshipText(userId);
  const fid = trimFriendshipText(friendshipId);
  if (!viewer || !fid) return { ok: false, error: "bad_request" };
  const sb = getFriendshipSupabaseOrNull();
  if (!sb) return { ok: false, error: "server_unavailable" };
  const { data: row } = await (sb as any)
    .from("community_messenger_friendships")
    .select("requester_user_id, addressee_user_id, status")
    .eq("id", fid)
    .maybeSingle();
  const r = row as { requester_user_id?: string; addressee_user_id?: string; status?: string } | null;
  if (!r) return { ok: false, error: "friendship_not_found" };
  if (trimFriendshipText(r.addressee_user_id) !== viewer) return { ok: false, error: "forbidden" };
  if (r.status !== "pending") return { ok: false, error: "friendship_not_pending" };
  const now = friendshipNowIso();
  const { error } = await (sb as any)
    .from("community_messenger_friendships")
    .update({ status: "removed", removed_at: now, updated_at: now })
    .eq("id", fid)
    .eq("status", "pending");
  if (error) return { ok: false, error: String(error.message ?? "friendship_decline_failed") };
  return { ok: true, friendshipId: fid, targetUserId: trimFriendshipText(r.requester_user_id) };
}
