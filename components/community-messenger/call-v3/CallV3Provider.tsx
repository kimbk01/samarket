"use client";

import { useEffect, useState, type ReactNode } from "react";
import { getCurrentUserIdForDb } from "@/lib/auth/get-current-user";
import { callV3HandleRemoteTerminal, callV3IncomingDiscovered } from "@/lib/community-messenger/call-v3/call-v3-actions";
import { callV3FetchSession } from "@/lib/community-messenger/call-v3/call-v3-api";
import { startCallV3CallerTerminalBroadcastSubscribe } from "@/lib/community-messenger/call-v3/call-v3-caller-terminal-subscribe";
import { logCallV3 } from "@/lib/community-messenger/call-v3/call-v3-debug";
import { readCallV3ExitRouter } from "@/lib/community-messenger/call-v3/call-v3-route";
import {
  installDibayFcmCallBridge,
  readDibayCallPendingRoute,
  clearDibayCallPendingRoute,
  type DibayFcmIncomingWakeDetail,
} from "@/lib/community-messenger/dibay-fcm-call-bridge";
import {
  enqueueCallV3NativeEvent,
  handleCallV3NotificationRouteWake,
  handleCallV3WindowLocationRouteWake,
  markCallV3NativeBridgeReady,
} from "@/lib/community-messenger/call-v3/call-v3-native-bridge";
import { isDibayCallV3SafeLaneEnabled } from "@/lib/community-messenger/call-v3/call-v3-flag";
import { startCallV3IncomingDiscovery } from "@/lib/community-messenger/call-v3/call-v3-incoming-discovery";
import { onCommunityMessengerBusEvent } from "@/lib/community-messenger/multi-tab-bus";
import {
  clearNativePersistedCallPendingRoute,
  readNativePersistedCallPendingRoute,
} from "@/lib/push/native/push-route-native-bridge";
import {
  isCallV3NativeNotificationRoute,
  resolveCallV3NativeRouteSource,
} from "@/lib/push/native/call-v3-native-route";

type VoipCallActionDetail = {
  sessionId?: string;
  action?: string;
};

function handleVoipCallActionV3(detail: VoipCallActionDetail | undefined): void {
  const callId = detail?.sessionId?.trim() ?? "";
  const action = detail?.action?.trim() ?? "";
  if (!callId) return;

  if (action === "accept") {
    enqueueCallV3NativeEvent({
      callId,
      action: "accept",
      source: "native_voip_accept",
    });
    return;
  }

  if (action === "reject_or_end" || action === "reject" || action === "end") {
    enqueueCallV3NativeEvent({
      callId,
      action: "reject",
      source: "native_voip_reject",
    });
  }
}

function handleCallRouteV3(path: string): void {
  if (!isCallV3NativeNotificationRoute(path)) return;
  handleCallV3NotificationRouteWake(path, { source: resolveCallV3NativeRouteSource(path) });
}

async function hydrateIncomingWake(detail: DibayFcmIncomingWakeDetail): Promise<void> {
  const callId = detail.sessionId?.trim() ?? "";
  if (!callId) return;

  logCallV3("native_notification_received", {
    callId,
    roomId: detail.roomId ?? null,
    callKind: detail.callKind ?? null,
  });

  const session = await callV3FetchSession(callId);
  if (session?.status === "ringing" && !session.isMineInitiator) {
    callV3IncomingDiscovered(session);
  }
}

async function consumeNativePendingCallRoutes(): Promise<void> {
  const sessionPending = readDibayCallPendingRoute();
  if (sessionPending) {
    handleCallRouteV3(sessionPending);
    clearDibayCallPendingRoute();
  }

  const nativePending = await readNativePersistedCallPendingRoute();
  if (nativePending?.path) {
    handleCallRouteV3(nativePending.path);
    await clearNativePersistedCallPendingRoute();
  }

  handleCallV3WindowLocationRouteWake({ source: "notification_tap" });
}

type CallV3ProviderProps = {
  children?: ReactNode;
};

/**
 * V3 Safe Lane root — discovery, native notification replay, foreground incoming signals.
 * Native is signal-only; PATCH owner is Web V3.
 */
export function CallV3Provider({ children }: CallV3ProviderProps) {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!isDibayCallV3SafeLaneEnabled()) return;
    let cancelled = false;
    void getCurrentUserIdForDb().then((id) => {
      if (!cancelled) setUserId(id);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isDibayCallV3SafeLaneEnabled()) return;

    let cancelled = false;

    void (async () => {
      logCallV3("provider_ready", {});
      await consumeNativePendingCallRoutes();
      if (cancelled) return;
      markCallV3NativeBridgeReady();
    })();

    const stopDiscovery = startCallV3IncomingDiscovery();
    const stopCallerTerminalSubscribe = userId
      ? startCallV3CallerTerminalBroadcastSubscribe(userId)
      : () => undefined;

    const offBridge = installDibayFcmCallBridge({
      onIncomingWake: (detail) => {
        void hydrateIncomingWake(detail);
      },
      onFcmTerminal: (detail) => {
        void callV3HandleRemoteTerminal(
          detail.callId,
          detail.terminalKind,
          readCallV3ExitRouter() ?? undefined
        );
      },
    });

    const offBus = onCommunityMessengerBusEvent((ev) => {
      if (ev.type !== "cm.call.session_terminal") return;
      const callId = ev.sessionId?.trim();
      if (!callId) return;
      void callV3HandleRemoteTerminal(callId, ev.status ?? "cancelled", readCallV3ExitRouter() ?? undefined);
    });

    const onVoipAction = (event: Event) => {
      handleVoipCallActionV3((event as CustomEvent<VoipCallActionDetail>).detail);
    };

    const onCallRoute = (event: Event) => {
      const path = (event as CustomEvent<{ path?: string }>).detail?.path?.trim();
      if (!path) return;
      handleCallRouteV3(path);
    };

    const onPushRoute = (event: Event) => {
      const path = (event as CustomEvent<{ path?: string }>).detail?.path?.trim();
      if (!path) return;
      handleCallV3NotificationRouteWake(path, { source: "notification_tap" });
    };

    const maybeConsumeOnResume = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void consumeNativePendingCallRoutes();
    };

    window.addEventListener("dibay:voip-call-action", onVoipAction);
    window.addEventListener("dibay:call-route", onCallRoute);
    window.addEventListener("dibay:push-route", onPushRoute);
    window.addEventListener("focus", maybeConsumeOnResume);
    document.addEventListener("visibilitychange", maybeConsumeOnResume);

    return () => {
      cancelled = true;
      stopDiscovery();
      stopCallerTerminalSubscribe();
      offBridge();
      offBus();
      window.removeEventListener("dibay:voip-call-action", onVoipAction);
      window.removeEventListener("dibay:call-route", onCallRoute);
      window.removeEventListener("dibay:push-route", onPushRoute);
      window.removeEventListener("focus", maybeConsumeOnResume);
      document.removeEventListener("visibilitychange", maybeConsumeOnResume);
    };
  }, [userId]);

  return <>{children}</>;
}
