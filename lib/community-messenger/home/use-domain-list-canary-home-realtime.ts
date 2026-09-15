"use client";

/**
 * Domain trade/delivery list surfaces mount outside CommunityMessengerHome.
 * TRADE LIST REALTIME remains Postgres home channels — reuse the same binder so
 * message INSERT still reaches DomainRoomStateRealtimeHost → projection → canary.
 */
import { useCallback, useMemo } from "react";
import { useCommunityMessengerHomeRealtime } from "@/lib/community-messenger/use-community-messenger-realtime";

function roomIdsContentKey(ids: readonly string[]): string {
  const set = new Set<string>();
  for (const id of ids) {
    const t = String(id ?? "").trim();
    if (t) set.add(t);
  }
  return [...set].sort().join("\0");
}

export function useDomainListCanaryHomeRealtime(args: {
  viewerUserId: string | null | undefined;
  roomIds: readonly string[];
  enabled: boolean;
  onSoftRefresh?: () => void;
}): void {
  const contentKey = roomIdsContentKey(args.roomIds);
  const roomIds = useMemo(() => (contentKey ? contentKey.split("\0") : []), [contentKey]);

  const onRefresh = useCallback(() => {
    args.onSoftRefresh?.();
  }, [args.onSoftRefresh]);

  const uid = args.viewerUserId?.trim() || null;
  useCommunityMessengerHomeRealtime({
    userId: uid,
    roomIds,
    enabled: Boolean(args.enabled && uid && roomIds.length > 0),
    onRefresh,
  });
}
