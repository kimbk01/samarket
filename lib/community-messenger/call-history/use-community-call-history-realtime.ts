"use client";

import { useCallback, useRef } from "react";
import { mergeCallHistoryForHomeList } from "@/lib/community-messenger/call-history/call-history-merge";
import { sortCallHistoryEntries } from "@/lib/community-messenger/call-history/call-history-sorter";
import type { CommunityMessengerCallLog } from "@/lib/community-messenger/types";

type Args = {
  calls: CommunityMessengerCallLog[];
  onCallsChange: (next: CommunityMessengerCallLog[]) => void;
};

/** @deprecated 패널은 `useCommunityCallHistoryRealtimeSync` 사용 */
export function useCommunityCallHistoryRealtime({ calls, onCallsChange }: Args) {
  const callsRef = useRef(calls);
  callsRef.current = calls;

  const upsertCall = useCallback(
    (incoming: CommunityMessengerCallLog) => {
      const map = new Map(callsRef.current.map((c) => [c.id, c]));
      map.set(incoming.id, incoming);
      onCallsChange(mergeCallHistoryForHomeList(sortCallHistoryEntries([...map.values()])));
    },
    [onCallsChange]
  );

  return { upsertCall };
}
