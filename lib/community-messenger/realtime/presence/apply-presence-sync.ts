import type { CommunityMessengerPresenceState } from "@/lib/community-messenger/types";

type PresenceEntry = {
  userId: string;
  state: CommunityMessengerPresenceState;
  lastSeenAt: string | null;
  updatedAt: string | null;
};

/**
 * 실시간 접속 채널 sync → 저장소 맵. 채널에 있는 사람 = 받은 상태, 빠진 사람 = 오프라인.
 * @see docs/audit/messenger-direct-header-presence-audit-plan-2026-11-16.md §10 H2
 */
export function applyPresenceSyncToMap(
  previous: Record<string, PresenceEntry>,
  aggregated: Record<string, PresenceEntry>,
  observedAtIso: string
): Record<string, PresenceEntry> {
  const next: Record<string, PresenceEntry> = { ...previous };
  for (const [id, entry] of Object.entries(aggregated)) {
    next[id] = {
      userId: id,
      state: entry.state,
      lastSeenAt: previous[id]?.lastSeenAt ?? null,
      updatedAt: entry.updatedAt,
    };
  }
  for (const [id, prev] of Object.entries(previous)) {
    if (aggregated[id]) continue;
    /**
     * 온라인·자리 비움이던 사람이 빠진 순간 = 마지막 접속 (2026-11-16 감사 §10 H2 — 이전 값(서버 첫 값의 옛 시각)을 남기지 않는다).
     * 이미 오프라인이던 항목은 그대로 둔다.
     */
    if (prev.state === "offline") continue;
    next[id] = {
      ...prev,
      state: "offline",
      lastSeenAt: observedAtIso,
    };
  }
  return next;
}
