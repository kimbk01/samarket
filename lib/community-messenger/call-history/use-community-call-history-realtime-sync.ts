"use client";

import { useEffect, useRef } from "react";
import { subscribeWithRetry } from "@/lib/community-messenger/realtime/subscribe-with-retry";
import { MESSENGER_HOME_META_DEBOUNCE_MS } from "@/lib/community-messenger/messenger-latency-config";
import type { CommunityMessengerCallLog } from "@/lib/community-messenger/types";
import { getSupabaseClient } from "@/lib/supabase/client";
import { runSingleFlight } from "@/lib/http/run-single-flight";

const CALL_LOGS_FETCH_FLIGHT_KEY = "cm:call-logs-list";

export async function fetchCommunityMessengerCallLogsClient(): Promise<CommunityMessengerCallLog[] | null> {
  try {
    return await runSingleFlight(CALL_LOGS_FETCH_FLIGHT_KEY, async () => {
      const res = await fetch("/api/community-messenger/calls", {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        calls?: CommunityMessengerCallLog[];
      };
      if (!res.ok || !json.ok) return null;
      return json.calls ?? [];
    });
  } catch {
    return null;
  }
}

type Args = {
  enabled: boolean;
  viewerUserId: string | null | undefined;
  onRefetch: () => void | Promise<void>;
};

/**
 * 통화 목록 Realtime — `community_messenger_call_logs` INSERT/UPDATE/DELETE 시
 * debounced `GET /api/community-messenger/calls` 로 목록을 다시 맞춘다.
 *
 * 홈 meta 채널은 silent home-sync 만 돌려 `calls` 가 갱신되지 않으므로 패널 전용 구독이 필요하다.
 */
export function useCommunityCallHistoryRealtimeSync({ enabled, viewerUserId, onRefetch }: Args): void {
  const onRefetchRef = useRef(onRefetch);
  onRefetchRef.current = onRefetch;

  useEffect(() => {
    const userId = viewerUserId?.trim() ?? "";
    if (!enabled || !userId) return;

    const sb = getSupabaseClient();
    if (!sb) return;

    let cancelled = false;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const clearDebounce = () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
    };

    const scheduleRefetch = () => {
      if (cancelled) return;
      clearDebounce();
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        void onRefetchRef.current();
      }, MESSENGER_HOME_META_DEBOUNCE_MS);
    };

    const bound = subscribeWithRetry({
      sb,
      name: `community-messenger:call-logs:${userId}`,
      scope: "community-messenger:call-logs",
      isCancelled: () => cancelled,
      build: (ch) =>
        ch
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "community_messenger_call_logs",
              filter: `caller_user_id=eq.${userId}`,
            },
            () => scheduleRefetch()
          )
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "community_messenger_call_logs",
              filter: `peer_user_id=eq.${userId}`,
            },
            () => scheduleRefetch()
          ),
    });

    if (cancelled) {
      bound.stop();
      return;
    }

    return () => {
      cancelled = true;
      clearDebounce();
      bound.stop();
    };
  }, [enabled, viewerUserId]);
}
