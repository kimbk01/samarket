"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";
import { getSyncViewerUserIdForClient } from "@/lib/auth/get-current-user";
import { acquireIncomingCallRealtimeSubscription } from "@/lib/community-messenger/realtime/cm-incoming-call-realtime-holder";
import { DibayIncomingCallSurface } from "@/components/call-v3/DibayIncomingCallSurface";
import { DibayMissedCallToast } from "@/components/call-v3/DibayMissedCallToast";
import {
  dispatchCallV3Event,
  installCallV3NativeEventListener,
  parseCallV3RemoteEndFromSignal,
  refreshCallV3IncomingFromHttp,
  sessionToIncomingPayload,
} from "@/lib/call-v3/call-v3-events";
import { subscribeCallV3Context, useCallV3Store } from "@/lib/call-v3/call-v3-store";
import { readCallV3PendingRoute, clearCallV3PendingRoute } from "@/lib/call-v3/call-v3-pending-route";
import { logCallV3FeatureFlag } from "@/lib/call-v3/call-v3-feature-flag";
import { logCallV3 } from "@/lib/call-v3/call-v3-log";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

const INCOMING_CALL_REALTIME_SCOPE = "community_messenger_incoming_call_v3";

export function DibayCallHost() {
  const router = useRouter();
  const ctx = useSyncExternalStore(
    subscribeCallV3Context,
    () => useCallV3Store.getState().ctx,
    () => useCallV3Store.getState().ctx
  );

  useEffect(() => {
    logCallV3FeatureFlag("DibayCallHost");
    logCallV3("host_mounted", { host: "DibayCallHost" });
    useCallV3Store.getState().setRouter(router);
  }, [router]);

  useEffect(() => {
    const pending = readCallV3PendingRoute();
    if (pending?.path) {
      clearCallV3PendingRoute();
      router.push(pending.path);
    }
  }, [router]);

  useEffect(() => {
    const onCallRoute = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as { path?: string } | undefined;
      const path = detail?.path?.trim();
      if (path?.startsWith("/")) {
        writeCallV3PendingRouteFromEvent(path);
        router.push(path);
      }
    };
    window.addEventListener("dibay:call-v3-route", onCallRoute);
    return () => window.removeEventListener("dibay:call-v3-route", onCallRoute);
  }, [router]);

  useEffect(() => installCallV3NativeEventListener(), []);

  useEffect(() => {
    void refreshCallV3IncomingFromHttp();
    const userId = getSyncViewerUserIdForClient()?.trim();
    if (!userId) return;

    let cancelled = false;
    const sb = getSupabaseClient();
    if (!sb) return;
    const sub = acquireIncomingCallRealtimeSubscription({
      sb,
      name: `call-v3-incoming:${userId}`,
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
              dispatchCallV3Event({ type: "CALL_INCOMING", payload: sessionToIncomingPayload(row) });
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
              const parsed = parseCallV3RemoteEndFromSignal(row);
              if (!parsed?.senderId) return;
              dispatchCallV3Event({ type: "CALL_REMOTE_ENDED", payload: parsed });
            }
          ),
      onAfterSubscribeFailure: () => {
        void refreshCallV3IncomingFromHttp();
      },
    });

    const pollId = window.setInterval(() => {
      void refreshCallV3IncomingFromHttp();
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
      {showIncomingOverlay ? <DibayIncomingCallSurface ctx={ctx} /> : null}
      <DibayMissedCallToast ctx={ctx} />
    </>
  );
}

function writeCallV3PendingRouteFromEvent(path: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      "dibay_call_pending_route",
      JSON.stringify({ path, at: Date.now() })
    );
  } catch {
    /* ignore */
  }
}
