import type { CommunityMessengerFriendRequest } from "@/lib/community-messenger/types";

/** 부트스트랩 `requests` — pending 만 서버에서 내려오며, 방향별로 UI 섹션을 나눈다. */
export function partitionPendingMessengerFriendRequests(
  requests: CommunityMessengerFriendRequest[] | undefined
): { received: CommunityMessengerFriendRequest[]; sent: CommunityMessengerFriendRequest[] } {
  const pending = (requests ?? []).filter((r) => r.status === "pending");
  return {
    received: pending.filter((r) => r.direction === "incoming"),
    sent: pending.filter((r) => r.direction === "outgoing"),
  };
}

/** 친구 탭·받은 요청 배지 — `direction === "incoming"` pending 만 */
export function countReceivedPendingMessengerFriendRequests(
  requests: CommunityMessengerFriendRequest[] | undefined
): number {
  return partitionPendingMessengerFriendRequests(requests).received.length;
}

/** 보관함·알림 센터 — pending 전체(받은+보낸) */
export function countAllPendingMessengerFriendRequests(
  requests: CommunityMessengerFriendRequest[] | undefined
): number {
  return (requests ?? []).filter((r) => r.status === "pending").length;
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
