import type { CommunityMessengerPeerPresenceSnapshot } from "@/lib/community-messenger/types";

type PresenceEntry = {
  userId: string;
  state: CommunityMessengerPeerPresenceSnapshot["state"];
  lastSeenAt: string | null;
  updatedAt: string | null;
};

/**
 * 서버 접속 상태 묶음 조회 결과 → 접속 상태 저장소 맵.
 * - `fillOnly`(실시간 정상 중 첫 값): 저장소에 없는 id 만 채운다 — 실시간으로 이미 받은 값(온라인 등)을 덮지 않는다.
 * - 아니면(실시간 비정상 폴링): 지금처럼 덮는다. `updatedAt` 은 관측(수신) 시각.
 * @see docs/audit/messenger-direct-header-presence-audit-plan-2026-11-16.md F1
 */
export function mergePresenceSnapshotsIntoStoreMap<T extends Record<string, PresenceEntry>>(
  prev: T,
  snapshots: Map<string, CommunityMessengerPeerPresenceSnapshot>,
  opts: { observedAtIso: string; fillOnly: boolean }
): Record<string, PresenceEntry> {
  const byUserId: Record<string, PresenceEntry> = { ...prev };
  for (const [userId, snap] of snapshots) {
    const old = byUserId[userId];
    if (opts.fillOnly && old) continue;
    byUserId[userId] = {
      userId,
      state: snap.state,
      lastSeenAt: snap.lastSeenAt ?? old?.lastSeenAt ?? null,
      updatedAt: opts.observedAtIso,
    };
  }
  return byUserId;
}
