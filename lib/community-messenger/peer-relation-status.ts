/**
 * Backward-compatible re-exports.
 * New code should import from `@/lib/community-messenger/friendship`.
 */
export type { CommunityMessengerFriendshipState as CommunityMessengerPeerRelationState } from "@/lib/community-messenger/friendship/types";
export {
  resolveCommunityMessengerFriendshipStatus as resolveCommunityMessengerPeerRelationStatus,
  batchResolveCommunityMessengerFriendshipStatus,
} from "@/lib/community-messenger/friendship/friendship-resolver";
export {
  assertCanSendDirectMessage as assertCommunityMessengerPeerCanMessage,
  assertCanStartDirectCall as assertCommunityMessengerPeerCanCall,
} from "@/lib/community-messenger/friendship/friendship-permission-guards";
