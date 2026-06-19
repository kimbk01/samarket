"use client";

import { useEffect, useRef } from "react";
import { onCommunityMessengerBusEvent } from "@/lib/community-messenger/multi-tab-bus";
import { subscribeWithRetry } from "@/lib/community-messenger/realtime/subscribe-with-retry";
import type { CommunityMessengerCallLog } from "@/lib/community-messenger/types";
import { getSupabaseClient } from "@/lib/supabase/client";
import { runSingleFlight } from "@/lib/http/run-single-flight";

const CALL_LOGS_FETCH_FLIGHT_KEY = "cm:call-logs-list";

/** call_logs postgres_changes — 짧게 묶어 연속 INSERT burst 만 흡수 */
const CALL_HISTORY_TABLE_DEBOUNCE_MS = 60;

/** 세션 터미널 bus / call_sessions UPDATE 후 log INSERT 대기 */
const CALL_HISTORY_TERMINAL_REFETCH_DELAY_MS = 120;

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
 * 통화 목록 Realtime — `community_messenger_call_logs` · `call_sessions` · 터미널 bus.
 * 취소·종료 직후 목록에 바로 반영되도록 call_logs 보다 짧은 debounce + bus 즉시 refetch.
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
    let terminalTimer: ReturnType<typeof setTimeout> | null = null;

    const clearDebounce = () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
    };

    const clearTerminalTimer = () => {
      if (terminalTimer) {
        clearTimeout(terminalTimer);
        terminalTimer = null;
      }
    };

    const runRefetch = () => {
      if (cancelled) return;
      void onRefetchRef.current();
    };

    const scheduleTableRefetch = () => {
      if (cancelled) return;
      clearDebounce();
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        runRefetch();
      }, CALL_HISTORY_TABLE_DEBOUNCE_MS);
    };

    /** 발신 취소·종료·수신 거절 — DB log INSERT 전에도 bus 로 먼저 당김 */
    const scheduleTerminalRefetch = () => {
      if (cancelled) return;
      clearTerminalTimer();
      terminalTimer = setTimeout(() => {
        terminalTimer = null;
        runRefetch();
      }, CALL_HISTORY_TERMINAL_REFETCH_DELAY_MS);
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
            () => scheduleTableRefetch()
          )
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "community_messenger_call_logs",
              filter: `peer_user_id=eq.${userId}`,
            },
            () => scheduleTableRefetch()
          )
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "community_messenger_call_sessions",
              filter: `initiator_user_id=eq.${userId}`,
            },
            () => scheduleTerminalRefetch()
          )
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "community_messenger_call_sessions",
              filter: `recipient_user_id=eq.${userId}`,
            },
            () => scheduleTerminalRefetch()
          ),
    });

    const unsubBus = onCommunityMessengerBusEvent((ev) => {
      if (ev.type !== "cm.call.session_terminal") return;
      scheduleTerminalRefetch();
    });

    if (cancelled) {
      bound.stop();
      unsubBus();
      return;
    }

    return () => {
      cancelled = true;
      clearDebounce();
      clearTerminalTimer();
      bound.stop();
      unsubBus();
    };
  }, [enabled, viewerUserId]);
}
