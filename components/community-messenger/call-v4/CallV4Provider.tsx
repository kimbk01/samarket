"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { startNativeConnectedSync } from "@/lib/call/native/native-connected-sync";
import { startNativeTerminalSync } from "@/lib/call/native/native-terminal-sync";
import { isLegacyWebCallEstablishmentRemoved } from "@/lib/call/native/legacy-web-call-establishment-removed";
import { getCurrentUserIdForDb } from "@/lib/auth/get-current-user";
import { subscribeCallV4ProviderUserIdFill } from "@/lib/community-messenger/call-v4/call-v4-provider-user-id-fill";
import { useCallV4ForegroundResume } from "@/lib/community-messenger/call-v4/use-call-v4-foreground-resume";
import { useCallV4PresentationPlatform } from "@/lib/community-messenger/call-v4/presentation/use-call-v4-presentation-platform";
import {
  callV4HandleRejectRoute,
  callV4HandleRemoteTerminal,
  hydrateCallV4CalleeScreen,
} from "@/lib/community-messenger/call-v4/call-v4-actions";
import { callV4CancelAttempt, callV4FetchSession } from "@/lib/community-messenger/call-v4/call-v4-api";
import { takePendingCallAttemptJournal } from "@/lib/community-messenger/call-v4/call-v4-attempt-journal";
import { readCallV4OutgoingAttempt } from "@/lib/community-messenger/call-v4/call-v4-outgoing-attempt";
import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";
import {
  registerCallV4ConnectedTerminalHandler,
  startCallV4TerminalRealtimeWatch,
} from "@/lib/community-messenger/call-v4/call-v4-connected-terminal-watch";
import { primeCallV4ConnectionWarm } from "@/lib/community-messenger/call-v4/call-v4-connection-warm";
import { isCallV4TelegramLaneEnabled } from "@/lib/community-messenger/call-v4/call-v4-flag";
import { tryPrimeCallV4WebIncomingOwner } from "@/lib/community-messenger/call-v4/call-v4-platform-owner-claim";
import {
  discoverCallV4IncomingSessionIfWebOwner,
  startCallV4IncomingDiscovery,
  tryHydrateCallV4IncomingForWebOwner,
} from "@/lib/community-messenger/call-v4/call-v4-incoming-discovery";
import {
  getCallV4PersistedSurfaceOwner,
  ingestCallV4NativeIncomingSurfaceSignal,
  ingestCallV4SurfaceOwnerSignal,
  isCallV4NativeAcceptingSurface,
  registerCallV4NativeAcceptingSurface,
  resolveCallV4NativeAcceptingSurfaceType,
  shouldRegisterCallV4NativeAcceptingFromRoute,
  syncCallV4NativeAcceptingSurfaceFromWindowLocation,
  type CallV4NativeIncomingSurfaceSignal,
  type CallV4SurfaceOwnerSignal,
} from "@/lib/community-messenger/call-v4/call-v4-incoming-surface";
import {
  isCallV4CalleeAcceptRoute,
  isCallV4CalleeRejectRoute,
  normalizeCallV4AppPath,
  readCallV4SessionIdFromNativeRoute,
} from "@/lib/community-messenger/call-v4/call-v4-native-route";
import {
  isNativeAcceptInflight,
  seedCallV4NativeAcceptInflightFromRoute,
  syncCallV4NativeAcceptInflightFromWindowLocation,
} from "@/lib/community-messenger/call-v4/call-v4-native-accept-flight";
import { readCallV4ExitRouter } from "@/lib/community-messenger/call-v4/call-v4-route";
import { readCallV4Identity, readCallV4Phase, useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";
import {
  isCapacitorNativePlatform,
  resolveCapacitorShellPlatform,
} from "@/lib/platform/capacitor-native";
import {
  installDibayFcmCallBridge,
  type DibayFcmIncomingWakeDetail,
} from "@/lib/community-messenger/dibay-fcm-call-bridge";
import { onCommunityMessengerBusEvent } from "@/lib/community-messenger/multi-tab-bus";
import { CallV4IncomingSheet } from "@/components/community-messenger/call-v4/CallV4IncomingSheet";
import { CallV4ActiveCallHost } from "@/components/community-messenger/call-v4/CallV4ActiveCallHost";
import { NativeActiveCallBar } from "@/components/community-messenger/call-native/NativeActiveCallBar";

type CallV4ProviderProps = {
  children?: ReactNode;
};

/** Mount sync companion when V4 lane ON, Android native lane, or iOS native call sync. */
function shouldMountCallV4Companion(): boolean {
  if (isCallV4TelegramLaneEnabled()) return true;
  if (isLegacyWebCallEstablishmentRemoved()) return true;
  return isCapacitorNativePlatform() && resolveCapacitorShellPlatform() === "ios";
}

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

function logCallV4RouteAcceptDetected(path: string, source?: string): void {
  const acceptCallId = readCallV4SessionIdFromNativeRoute(path);
  if (!acceptCallId) return;
  logCallV4("route_accept_seen", { callId: acceptCallId, path, source: source ?? null });
  void callV4FetchSession(acceptCallId).then((session) => {
    const kind =
      session?.callKind === "video" ? "video" : session?.callKind === "voice" ? "audio" : "unknown";
    logCallV4("call_v4_route_accept_detected", {
      callId: acceptCallId,
      kind,
      path,
      source: source ?? null,
    });
  });
}

function seedCallV4NativeAcceptRouteState(path: string): void {
  const callId = seedCallV4NativeAcceptInflightFromRoute(path);
  if (!callId) return;
  const phase = readCallV4Phase();
  if (phase === "idle" || phase === "incoming_ringing" || phase === "accepting") {
    useCallV4Store.getState().setPhase("accepting");
  }
  void hydrateCallV4CalleeScreen(callId);
}

const replacedV4AcceptCallIds = new Set<string>();

function isAlreadyOnCallV4AcceptRoute(currentPath: string, targetPath: string): boolean {
  const current = normalizeCallV4AppPath(currentPath);
  const target = normalizeCallV4AppPath(targetPath);
  if (!isCallV4CalleeAcceptRoute(current)) return false;
  const currentCallId = readCallV4SessionIdFromNativeRoute(current);
  const targetCallId = readCallV4SessionIdFromNativeRoute(target);
  return Boolean(currentCallId && targetCallId && currentCallId === targetCallId);
}

/** Native `dibay:call-route` accept — seed inflight then ensure calls-v4 screen navigation. */
export function handleCallV4NativeRouteEvent(
  path: string,
  router: { replace: (href: string) => void },
  currentPath: string,
): void {
  const normalizedPath = normalizeCallV4AppPath(path);
  if (!normalizedPath) return;

  logCallV4("call_v4_route_event_received", { path: normalizedPath });

  if (isLegacyWebCallEstablishmentRemoved()) {
    logCallV4("legacy_web_establishment_removed", {
      callId: readCallV4SessionIdFromNativeRoute(normalizedPath),
      path: normalizedPath,
      trigger: "native_route_event",
    });
    return;
  }

  if (isCallV4CalleeAcceptRoute(normalizedPath)) {
    const source =
      new URLSearchParams(
        normalizedPath.includes("?") ? normalizedPath.slice(normalizedPath.indexOf("?") + 1) : "",
      ).get("source")?.trim() ?? null;
    logCallV4("web_call_v4_native_accept_received", {
      callId: readCallV4SessionIdFromNativeRoute(normalizedPath),
      path: normalizedPath,
      source,
    });
    logCallV4RouteAcceptDetected(normalizedPath, "native_route_event");
    seedCallV4NativeAcceptRouteState(normalizedPath);
    const callId = readCallV4SessionIdFromNativeRoute(normalizedPath);
    logCallV4("call_v4_route_accept_seeded", {
      callId: callId ?? null,
      path: normalizedPath,
    });

    if (callId) {
      if (isAlreadyOnCallV4AcceptRoute(currentPath, normalizedPath)) {
        logCallV4("router_replace_calls_v4_accept_skipped_duplicate", {
          callId,
          path: normalizedPath,
          reason: "already_on_route",
        });
      } else if (replacedV4AcceptCallIds.has(callId)) {
        logCallV4("router_replace_calls_v4_accept_skipped_duplicate", {
          callId,
          path: normalizedPath,
          reason: "already_replaced",
        });
      } else {
        replacedV4AcceptCallIds.add(callId);
        logCallV4("router_replace_calls_v4_accept", { callId, path: normalizedPath });
        router.replace(normalizedPath);
      }
    }
  }

  registerCallV4NativeAcceptingFromAppPath(normalizedPath);
}

export function resetCallV4AcceptRouteReplaceForTests(): void {
  replacedV4AcceptCallIds.clear();
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

  if (isNativeAcceptInflight(callId)) return;

  syncCallV4NativeAcceptingSurfaceFromWindowLocation();
  if (isCallV4NativeAcceptingSurface(callId)) {
    logCallV4("incoming_sheet_suppressed_native_accepting", { callId });
    return;
  }

  await tryPrimeCallV4WebIncomingOwner(callId, "fcm_wake");
  discoverCallV4IncomingSessionIfWebOwner(session);
}

type CallV4WebEstablishmentHostProps = {
  children?: ReactNode;
  pathname: string;
  router: ReturnType<typeof useRouter>;
  userId: string | null;
};

/** Desktop / non-Android Web establishment shell — not mounted on Android sync-only. */
function CallV4WebEstablishmentHost({ children, pathname, router, userId }: CallV4WebEstablishmentHostProps) {
  const phase = useCallV4Store((s) => s.phase);
  const identity = useCallV4Store((s) => s.identity);

  useCallV4PresentationPlatform({
    callId: identity?.callId ?? null,
    phase,
    mediaType: identity?.mediaType ?? null,
    roomId: identity?.roomId ?? null,
  });

  useCallV4ForegroundResume();

  useEffect(() => {
    if (!userId) return;
    return startCallV4IncomingDiscovery(userId);
  }, [userId]);

  useLayoutEffect(() => {
    syncCallV4NativeAcceptInflightFromWindowLocation();
    syncCallV4NativeAcceptingSurfaceFromWindowLocation();
    const path = `${pathname}${typeof window !== "undefined" ? window.location.search : ""}`;
    if (!path.includes("/community-messenger/calls-v4/")) return;
    if (isCallV4CalleeRejectRoute(path)) {
      const callId = readCallV4SessionIdFromNativeRoute(path);
      if (callId) void callV4HandleRejectRoute(callId, router);
      return;
    }
    if (isCallV4CalleeAcceptRoute(path)) {
      logCallV4RouteAcceptDetected(path);
      seedCallV4NativeAcceptRouteState(path);
      if (shouldRegisterCallV4NativeAcceptingFromRoute(path)) {
        registerCallV4NativeAcceptingFromAppPath(path);
      }
    }
  }, [pathname, router]);

  useEffect(() => {
    const onNativeRoute = (event: Event) => {
      const path = (event as CustomEvent<{ path?: string }>).detail?.path?.trim();
      if (!path) return;
      const currentPath = `${pathname}${typeof window !== "undefined" ? window.location.search : ""}`;
      handleCallV4NativeRouteEvent(path, router, currentPath);
    };

    window.addEventListener("dibay:call-route", onNativeRoute);
    window.addEventListener("dibay:push-route", onNativeRoute);
    return () => {
      window.removeEventListener("dibay:call-route", onNativeRoute);
      window.removeEventListener("dibay:push-route", onNativeRoute);
    };
  }, [pathname, router]);

  useEffect(() => {
    const onNativeSurfaceBridge = (event: Event) => {
      const detail = (event as CustomEvent<CallV4NativeIncomingSurfaceSignal>).detail;
      if (!detail?.callId) return;
      logCallV4("native_surface_bridge_received", {
        callId: detail.callId.trim(),
        visible: detail.hasNativeIncomingSurface,
        source: detail.source,
      });
      ingestCallV4NativeIncomingSurfaceSignal(detail);
    };

    const onSurfaceOwnerBridge = (event: Event) => {
      const detail = (event as CustomEvent<CallV4SurfaceOwnerSignal>).detail;
      if (!detail?.callId) return;
      logCallV4("surface_owner_bridge_received", {
        callId: detail.callId.trim(),
        owner: detail.owner,
        reason: detail.reason,
      });
      ingestCallV4SurfaceOwnerSignal(detail);
      if (
        detail.owner === "terminal" &&
        detail.reason?.includes("ios_callkit_end") &&
        isCapacitorNativePlatform() &&
        resolveCapacitorShellPlatform() === "ios"
      ) {
        const sid = detail.callId.trim();
        const identity = readCallV4Identity();
        if (identity?.callId === sid) {
          void callV4HandleRemoteTerminal(
            sid,
            "ended",
            readCallV4ExitRouter() ?? router,
            detail.reason,
          );
        }
      }
      const owner = getCallV4PersistedSurfaceOwner(detail.callId.trim());
      if (owner === "web_in_app") {
        void tryHydrateCallV4IncomingForWebOwner(detail.callId.trim());
      }
    };

    window.addEventListener("dibay:call-v4-native-surface", onNativeSurfaceBridge);
    window.addEventListener("dibay:call-surface-owner", onSurfaceOwnerBridge);
    return () => {
      window.removeEventListener("dibay:call-v4-native-surface", onNativeSurfaceBridge);
      window.removeEventListener("dibay:call-surface-owner", onSurfaceOwnerBridge);
    };
  }, [router]);

  return (
    <>
      <CallV4IncomingSheet />
      <CallV4ActiveCallHost />
      {children}
    </>
  );
}

/** V4 lane — Android sync-only + desktop establishment. */
export function CallV4Provider({ children }: CallV4ProviderProps) {
  const [userId, setUserId] = useState<string | null>(null);
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const syncOnly =
    isLegacyWebCallEstablishmentRemoved() ||
    (isCapacitorNativePlatform() && resolveCapacitorShellPlatform() === "ios");

  /** D3: 인증 이벤트 처리기가 최신 값을 읽도록 */
  const userIdRef = useRef<string | null>(null);
  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  useEffect(() => {
    if (!shouldMountCallV4Companion()) return;
    let cancelled = false;
    void getCurrentUserIdForDb().then((id) => {
      /** D3: 로그인 이벤트로 먼저 채워졌으면 늦게 온 마운트 결과(null 포함)로 덮지 않는다. */
      if (!cancelled) setUserId((prev) => prev ?? id);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * D3 (Owner 승인 2026-11-09): 로그인 완료가 새로고침 없이(router.replace) 이동해도 사용자 ID 를 채워
   * 수신 탐지·종료 감시를 시작한다. 비어 있을 때만 1회 — 기존 ID 변경·해제 없음(진행 중 통화 보호, 헬퍼 주석 참조).
   */
  useEffect(() => {
    if (!shouldMountCallV4Companion()) return;
    return subscribeCallV4ProviderUserIdFill({
      readCurrent: () => userIdRef.current,
      resolveUserId: getCurrentUserIdForDb,
      apply: (id) => setUserId((prev) => prev ?? id),
    });
  }, []);

  useEffect(() => {
    if (!shouldMountCallV4Companion()) return;
    return startNativeConnectedSync();
  }, []);

  useEffect(() => {
    if (!shouldMountCallV4Companion()) return;
    return startNativeTerminalSync();
  }, []);

  useEffect(() => {
    if (!shouldMountCallV4Companion()) return;
    return registerCallV4ConnectedTerminalHandler((callId, status, source) =>
      callV4HandleRemoteTerminal(callId, status, readCallV4ExitRouter() ?? router, source),
    );
  }, [router]);

  useEffect(() => {
    if (!shouldMountCallV4Companion() || !userId) return;
    return startCallV4TerminalRealtimeWatch(userId);
  }, [userId]);

  /**
   * §15-4 재로드 복구 — 생성 응답을 받기 전에 웹이 죽거나 다시 로드되면(Android 렌더러 재생성·iOS WKWebView 재로드·
   * 앱 종료 후 재실행) 남은 발신 시도를 서버에서 취소한다. 응답을 받은 시도는 기록이 지워져 있어 건드리지 않는다.
   */
  useEffect(() => {
    if (!shouldMountCallV4Companion() || !userId) return;
    const pending = takePendingCallAttemptJournal(readCallV4OutgoingAttempt()?.attemptId ?? null);
    if (pending) void callV4CancelAttempt(pending, "reload_recovery");
  }, [userId]);

  useEffect(() => {
    if (!shouldMountCallV4Companion()) return;

    logCallV4("provider_ready", { syncOnly });

    const offBridge = installDibayFcmCallBridge({
      onIncomingWake: syncOnly
        ? () => {}
        : (detail) => {
            void hydrateCallV4IncomingWake(detail);
          },
      onFcmTerminal: (detail) => {
        void callV4HandleRemoteTerminal(
          detail.callId,
          detail.terminalKind,
          readCallV4ExitRouter() ?? router,
          "fcm",
        );
      },
    });

    const offBus = onCommunityMessengerBusEvent((ev) => {
      if (ev.type === "cm.call.session_terminal") {
        const callId = ev.sessionId?.trim();
        if (!callId) return;
        void callV4HandleRemoteTerminal(callId, ev.status ?? "cancelled", readCallV4ExitRouter() ?? router, "bus");
        return;
      }
      if (ev.type === "cm.call.incoming_consumed") {
        const callId = ev.sessionId?.trim();
        if (!callId) return;
        const reason = (ev.reason ?? "").trim().toLowerCase();
        // W2 (call-termination-authority-audit): 수락은 종료가 아니다. 같은 WebView 의 수락 표시를 「ended」로 바꿔
        // 네이티브 통화를 끝내던 경로를 막는다. 다른 기기 수락은 서버 answered_elsewhere 로 별도 도달한다.
        if (reason.includes("accept")) {
          logCallV4("incoming_consumed_accept_ignored", { callId, reason });
          return;
        }
        const status =
          reason.includes("reject") || reason.includes("declin")
              ? "rejected"
              : reason.includes("miss")
                ? "missed"
                : "cancelled";
        void callV4HandleRemoteTerminal(callId, status, readCallV4ExitRouter() ?? router, "bus");
      }
    });

    return () => {
      offBridge();
      offBus();
    };
  }, [router, syncOnly]);

  if (!shouldMountCallV4Companion()) return children ?? null;

  if (syncOnly) {
    return <>{children}</>;
  }

  return (
    <CallV4WebEstablishmentHost pathname={pathname} router={router} userId={userId}>
      {children}
    </CallV4WebEstablishmentHost>
  );
}

function CallV4IncomingChrome() {
  return (
    <>
      <CallV4Provider>
        <></>
      </CallV4Provider>
      {/* 앱 전체 통화 바 — Capacitor 네이티브 + 복귀 지원 바이너리에서만 표시 (데스크톱 웹 무관) */}
      <NativeActiveCallBar />
    </>
  );
}

export { CallV4IncomingChrome };
