/**
 * Room snapshot friendship fields — Step 3 (Gate C).
 * Design: docs/community-messenger/friendship-ssot-design.md
 *
 * Maps `resolveFriendshipPair` output to snapshot friendship projection only.
 */

import {
  peerFriendshipStateFromResolution,
  type FriendshipPairResolution,
} from "@/lib/community-messenger/friendship-resolver";
import type {
  FriendshipDirection,
  ResolveFriendshipPairResult,
} from "@/lib/community-messenger/friendship/resolve-friendship-pair";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";

export type RoomSnapshotFriendshipProjection = {
  peerFriendshipState: NonNullable<CommunityMessengerRoomSnapshot["peerFriendshipState"]>;
  friendshipDirection: FriendshipDirection;
  pendingFriendshipRequestId?: string;
};

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function friendshipPairResolutionFromResolved(
  resolved: ResolveFriendshipPairResult
): FriendshipPairResolution {
  return {
    state: resolved.state,
    source: resolved.source,
    row: resolved.row,
  };
}

/** Pure projection — snapshot friendship fields from resolver result only. */
export function projectRoomSnapshotFriendshipFromResolution(
  resolved: ResolveFriendshipPairResult
): RoomSnapshotFriendshipProjection {
  const peerFriendshipState = peerFriendshipStateFromResolution(
    friendshipPairResolutionFromResolved(resolved)
  );
  const pendingId =
    resolved.state === "pending" && resolved.row?.id ? trimText(resolved.row.id) : "";
  return {
    peerFriendshipState,
    friendshipDirection: resolved.direction,
    ...(pendingId ? { pendingFriendshipRequestId: pendingId } : {}),
  };
}
