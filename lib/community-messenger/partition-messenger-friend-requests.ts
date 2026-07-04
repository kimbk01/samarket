import type { CommunityMessengerFriendRequest } from "@/lib/community-messenger/types";

/** P4 — pending friend-request UI removed; partition/counts always empty. */
export function partitionPendingMessengerFriendRequests(
  _requests: CommunityMessengerFriendRequest[] | undefined
): { received: CommunityMessengerFriendRequest[]; sent: CommunityMessengerFriendRequest[] } {
  return { received: [], sent: [] };
}

export function countReceivedPendingMessengerFriendRequests(
  _requests: CommunityMessengerFriendRequest[] | undefined
): number {
  return 0;
}

export function countAllPendingMessengerFriendRequests(
  _requests: CommunityMessengerFriendRequest[] | undefined
): number {
  return 0;
}

export function hasActiveMessengerFriendRejectCooldown(
  cooldownUntilByPeerId: Record<string, number>,
  nowMs: number = Date.now()
): boolean {
  return Object.values(cooldownUntilByPeerId).some((until) => until > nowMs);
}

export type MessengerFriendRejectedPeerEntry = {
  peerId: string;
  label: string;
  cooldownUntilMs: number;
};

export function buildMessengerFriendRejectedPeerEntries(input: {
  cooldownUntilByPeerId: Record<string, number>;
  labelsByPeerId: Record<string, string>;
  nowMs: number;
  fallbackLabel: string;
}): MessengerFriendRejectedPeerEntry[] {
  const { cooldownUntilByPeerId, labelsByPeerId, nowMs, fallbackLabel } = input;
  return Object.entries(cooldownUntilByPeerId)
    .filter(([, until]) => until > nowMs)
    .map(([peerId, cooldownUntilMs]) => ({
      peerId,
      label: String(labelsByPeerId[peerId] ?? "").trim() || fallbackLabel,
      cooldownUntilMs,
    }))
    .sort((a, b) => b.cooldownUntilMs - a.cooldownUntilMs);
}
