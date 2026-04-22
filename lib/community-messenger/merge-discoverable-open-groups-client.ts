"use client";

import type { Dispatch, SetStateAction } from "react";
import { primeBootstrapCache } from "@/lib/community-messenger/bootstrap-cache";
import { fetchCommunityMessengerOpenGroupsClient } from "@/lib/community-messenger/cm-open-groups-client-fetch";
import type {
  CommunityMessengerBootstrap,
  CommunityMessengerDiscoverableGroupSummary,
} from "@/lib/community-messenger/types";

export type MergeOpenGroupsDiscoverableMode = "fill_if_empty" | "replace";

/**
 * `/api/community-messenger/open-groups` 결과로 `discoverableGroups` 보강.
 * Fetch 단일 비행은 `cm-open-groups-client-fetch` 의 `runSingleFlight`에 의존.
 */
export async function mergeDiscoverableGroupsFromOpenGroupsClient(
  setData: Dispatch<SetStateAction<CommunityMessengerBootstrap | null>>,
  mode: MergeOpenGroupsDiscoverableMode
): Promise<void> {
  try {
    const res2 = await fetchCommunityMessengerOpenGroupsClient();
    const j2 = (await res2.json().catch(() => ({}))) as {
      ok?: boolean;
      groups?: CommunityMessengerDiscoverableGroupSummary[];
    };
    if (!res2.ok || !j2.ok) return;
    const incoming = j2.groups ?? [];
    setData((prev) => {
      if (!prev) return prev;
      if (mode === "fill_if_empty") {
        if ((prev.discoverableGroups?.length ?? 0) > 0) return prev;
        if (incoming.length === 0) return prev;
        const merged = { ...prev, discoverableGroups: incoming };
        primeBootstrapCache(merged);
        return merged;
      }
      const merged = { ...prev, discoverableGroups: incoming };
      primeBootstrapCache(merged);
      return merged;
    });
  } catch {
    /* ignore */
  }
}
