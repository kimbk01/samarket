"use client";

import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getCurrentUserIdForDb } from "@/lib/auth/get-current-user";
import {
  callV4HandleRemoteTerminal,
  callV4HandleRejectRoute,
  callV4IncomingDiscovered,
} from "@/lib/community-messenger/call-v4/call-v4-actions";
import { callV4FetchSession } from "@/lib/community-messenger/call-v4/call-v4-api";
import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";
import { primeCallV4ConnectionWarm } from "@/lib/community-messenger/call-v4/call-v4-connection-warm";
import { isCallV4TelegramLaneEnabled } from "@/lib/community-messenger/call-v4/call-v4-flag";
import { startCallV4IncomingDiscovery } from "@/lib/community-messenger/call-v4/call-v4-incoming-discovery";
import {
  applyCallV4NativeIncomingSurfaceSignal,
  isCallV4NativeAcceptingSurface,
  registerCallV4NativeAcceptingSurface,
  resolveCallV4AppVisibility,
  resolveCallV4NativeAcceptingSurfaceType,
  shouldRegisterCallV4NativeAcceptingFromRoute,
  shouldSuppressCallV4IncomingDiscoveredForSheet,
  syncCallV4NativeAcceptingSurfaceFromWindowLocation,
} from "@/lib/community-messenger/call-v4/call-v4-incoming-surface";
import {
  isCallV4CalleeAcceptRoute,
  isCallV4CalleeRejectRoute,
  readCallV4SessionIdFromNativeRoute,
} from "@/lib/community-messenger/call-v4/call-v4-native-route";
import { readCallV4ExitRouter } from "@/lib/community-messenger/call-v4/call-v4-route";
import {
  installDibayFcmCallBridge,
  type DibayFcmIncomingWakeDetail,
} from "@/lib/community-messenger/dibay-fcm-call-bridge";
import { onCommunityMessengerBusEvent } from "@/lib/community-messenger/multi-tab-bus";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";
import { getNativeIncomingCallPlugin } from "@/lib/push/native/push-route-native-bridge";
import { CallV4IncomingSheet } from "@/components/community-messenger/call-v4/CallV4IncomingSheet";

type CallV4ProviderProps = {
  children?: ReactNode;
};

function registerCallV4NativeAcceptingFromAppPath(path: string): void {
  if (!shouldRegisterCallV4NativeAcceptingFromRoute(path)) return;
  const callId = readCallV4SessionIdFromNativeRoute(path);
  if (!callId) return;
  const source = new URLSearchParams(path.includes("?") ? path.slice(path.indexOf("?") + 1) : "").get(
    "source",
  )?.trim() ?? "native";
  registerCallV4NativeAcceptingSurface(
    callId,
    resolveCallV4NativeAcceptingSurfaceType(source),
    source,
  );
}

async function hydrateCallV4IncomingWake(detail: DibayFcmIncomingWakeDetail): Promise<void> {
  const callId = detail.sessionId?.trim() ?? "";
  if (!callId) return;

  logCallV4("native_notification_received", {
    callId,
    roomId: detail.roomId ?? null,
    callKind: detail.callKind ?? null,
  });

  const session = await callV4FetchSession(callId);
  if (session?.status !== "ringing" || session.isMineInitiator) return;

  primeCallV4ConnectionWarm(callId);

  syncCallV4NativeAcceptingSurfaceFromWindowLocation();
  if (isCallV4NativeAcceptingSurface(callId)) {
    logCallV4("incoming_sheet_suppressed_native_accepting", { callId });
    return;
  }

  const suppress = shouldSuppressCallV4IncomingDiscoveredForSheet({
    callId,
    visibilityState: typeof document !== "undefined" ? document.visibilityState : "visible",
  });
  if (suppress.suppress) {
    logCallV4("incoming_wake_sheet_suppressed", { callId, reason: suppress.reason });
    return;
  }
  callV4IncomingDiscovered(session);
}

/** V4 lane — foreground discovery + incoming sheet only (no V3 replay). */
export function CallV4Provider({ children }: CallV4ProviderProps) {
  const [userId, setUserId] = useState<string | null>(null);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!isCallV4TelegramLaneEnabled()) return;
    let cancelled = false;
    void getCurrentUserIdForDb().then((id) => {
      if (!cancelled) setUserId(id);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isCallV4TelegramLaneEnabled() || !userId) return;
    return startCallV4IncomingDiscovery(userId);
  }, [userId]);

  useEffect(() => {
    if (!isCallV4TelegramLaneEnabled() || !isCapacitorNativePlatform()) return;

    void getNativeIncomingCallPlugin().then((plugin) => {
      if (!plugin) return;
      void plugin.getForegroundIncomingCallId().then((res) => {
        const callId = res.callId?.trim() ?? "";
        if (!callId) return;
        applyCallV4NativeIncomingSurfaceSignal({
          callId,
          hasNativeIncomingSurface: true,
          nativeSurfaceType: "foreground_pill",
          appVisibility: resolveCallV4AppVisibility(),
          source: "native_foreground_pill_boot",
        });
      });
    });
  }, []);

  useLayoutEffect(() => {
    if (!isCallV4TelegramLaneEnabled()) return;
    syncCallV4NativeAcceptingSurfaceFromWindowLocation();
    const path = `${pathname ?? ""}${typeof window !== "undefined" ? window.location.search : ""}`;
    if (!path.includes("/community-messenger/calls-v4/")) return;
    if (isCallV4CalleeRejectRoute(path)) {
      const callId = readCallV4SessionIdFromNativeRoute(path);
      if (callId) void callV4HandleRejectRoute(callId, router);
      return;
    }
    if (isCallV4CalleeAcceptRoute(path) && shouldRegisterCallV4NativeAcceptingFromRoute(path)) {
      registerCallV4NativeAcceptingFromAppPath(path);
    }
  }, [pathname, router]);

  useEffect(() => {
    if (!isCallV4TelegramLaneEnabled()) return;

    const onNativeRoute = (event: Event) => {
      const path = (event as CustomEvent<{ path?: string }>).detail?.path?.trim();
      if (!path) return;
      registerCallV4NativeAcceptingFromAppPath(path);
    };

    window.addEventListener("dibay:call-route", onNativeRoute);
    window.addEventListener("dibay:push-route", onNativeRoute);
    return () => {
      window.removeEventListener("dibay:call-route", onNativeRoute);
      window.removeEventListener("dibay:push-route", onNativeRoute);
    };
  }, []);

  useEffect(() => {
    if (!isCallV4TelegramLaneEnabled()) return;

    logCallV4("provider_ready", {});

    const offBridge = installDibayFcmCallBridge({
      onIncomingWake: (detail) => {
        const callId = detail.sessionId?.trim() ?? "";
        if (callId) {
          const appVisibility = resolveCallV4AppVisibility();
          if (appVisibility !== "foreground") {
            applyCallV4NativeIncomingSurfaceSignal({
              callId,
              hasNativeIncomingSurface: true,
              nativeSurfaceType: "fullscreen_intent",
              appVisibility,
              source: "fcm_wake_background",
            });
          }
        }
        void hydrateCallV4IncomingWake(detail);
      },
      onForegroundIncomingUi: ({ sessionId, visible }) => {
        const callId = sessionId.trim();
        if (!callId) return;
        applyCallV4NativeIncomingSurfaceSignal({
          callId,
          hasNativeIncomingSurface: visible,
          nativeSurfaceType: visible ? "foreground_pill" : undefined,
          appVisibility: resolveCallV4AppVisibility(),
          source: "native_foreground_pill",
        });
      },
      onFcmTerminal: (detail) => {
        void callV4HandleRemoteTerminal(
          detail.callId,
          detail.terminalKind,
          readCallV4ExitRouter() ?? router
        );
      },
    });

    const offBus = onCommunityMessengerBusEvent((ev) => {
      if (ev.type !== "cm.call.session_terminal") return;
      const callId = ev.sessionId?.trim();
      if (!callId) return;
      void callV4HandleRemoteTerminal(callId, ev.status ?? "cancelled", readCallV4ExitRouter() ?? router);
    });

    return () => {
      offBridge();
      offBus();
    };
  }, [router]);

  if (!isCallV4TelegramLaneEnabled()) return children ?? null;

  return (
    <>
      <CallV4IncomingSheet />
      {children}
    </>
  );
}

function CallV4IncomingChrome() {
  return (
    <CallV4Provider>
      <></>
    </CallV4Provider>
  );
}

export { CallV4IncomingChrome };
