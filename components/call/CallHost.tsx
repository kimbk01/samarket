"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";
import { getSyncViewerUserIdForClient } from "@/lib/auth/get-current-user";
import { acquireIncomingCallRealtimeSubscription } from "@/lib/community-messenger/realtime/cm-incoming-call-realtime-holder";
import { IncomingCallSurface } from "@/components/call/IncomingCallSurface";
import { MissedCallToast } from "@/components/call/MissedCallToast";
import {
  dispatchCallEvent,
  parseCallRemoteEndFromSignal,
  refreshCallIncomingFromHttp,
  sessionToIncomingPayload,
} from "@/lib/call/call-events";
import { subscribeCallContext, useCallStore } from "@/lib/call/call-store";
import { readCallPendingRoute, clearCallPendingRoute, writeCallPendingRoute } from "@/lib/call/call-pending-route";
import { installCallNativeEventListener, installCallRouteListener } from "@/lib/call/call-native-bridge";
import { logCall } from "@/lib/call/call-log";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

const INCOMING_CALL_REALTIME_SCOPE = "community_messenger_incoming_call";

export function CallHost() {
  const router = useRouter();
  const ctx = useSyncExternalStore(
    subscribeCallContext,
    () => useCallStore.getState().ctx,
    () => useCallStore.getState().ctx
  );

  useEffect(() => {
    logCall("runtime", "host_mounted", { host: "CallHost" });
    useCallStore.getState().setRouter(router);
  }, [router]);

  useEffect(() => {
    const pending = readCallPendingRoute();
    if (pending?.path) {
      clearCallPendingRoute();
      router.push(pending.path);
    }
  }, [router]);

  useEffect(() => installCallRouteListener((path) => {
    writeCallPendingRoute(path);
    router.push(path);
  }), [router]);

  useEffect(() => installCallNativeEventListener(), []);

  useEffect(() => {
    void refreshCallIncomingFromHttp();
    const userId = getSyncViewerUserIdForClient()?.trim();
    if (!userId) return;

    let cancelled = false;
    const sb = getSupabaseClient();
    if (!sb) return;
    const sub = acquireIncomingCallRealtimeSubscription({
      sb,
      name: `call-incoming:${userId}`,
      scope: INCOMING_CALL_REALTIME_SCOPE,
      isCancelled: () => cancelled,
      build: (channel) =>
        channel
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "community_messenger_call_sessions",
              filter: `recipient_user_id=eq.${userId}`,
            },
            (payload) => {
              const row = payload.new as CommunityMessengerCallSession | null;
              if (!row || row.status !== "ringing" || row.isMineInitiator) return;
              dispatchCallEvent({ type: "CALL_INCOMING", payload: sessionToIncomingPayload(row) });
            }
          )
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "community_messenger_call_signals",
              filter: `to_user_id=eq.${userId}`,
            },
            (payload) => {
              const row = payload.new as Record<string, unknown>;
              const parsed = parseCallRemoteEndFromSignal(row);
              if (!parsed?.senderId) return;
              dispatchCallEvent({ type: "CALL_REMOTE_ENDED", payload: parsed });
            }
          ),
      onAfterSubscribeFailure: () => {
        void refreshCallIncomingFromHttp();
      },
    });

    const pollId = window.setInterval(() => {
      void refreshCallIncomingFromHttp();
    }, 15_000);

    return () => {
      cancelled = true;
      sub.stop();
      window.clearInterval(pollId);
    };
  }, []);

  const showIncomingOverlay = ctx.state === "incoming" || ctx.state === "accepting";

  return (
    <>
      {showIncomingOverlay ? <IncomingCallSurface ctx={ctx} /> : null}
      <MissedCallToast ctx={ctx} />
    </>
  );
}
