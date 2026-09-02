"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { getSessionPhase, subscribeSessionPhase } from "@/lib/auth/dibay-session-manager";
import { isRecoveringPhase, type DibaySessionPhase } from "@/lib/auth/dibay-session-policy";
import { openLoginRequiredSheet } from "@/lib/auth/require-auth-action";
import { runNativePendingAcceptCall } from "@/lib/community-messenger/incoming-call-accept-gateway";
import { resolveDibayDeepLinkToAppPath } from "@/lib/platform/deep-link-routes";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";
import {
  isAuthRequiredPushRoute,
  resolvePushRouteFromFcmData,
} from "@/lib/push/resolve-push-route-from-fcm-data";
import { normalizeNativePushTapData } from "@/lib/push/normalize-native-push-tap-data";
import {
  clearPendingPushRoute,
  readPendingPushRoute,
  writePendingPushRoute,
} from "@/lib/push/pending-push-route";
import {
  clearNativePersistedPendingPushRoute,
  readNativePersistedPendingPushRoute,
} from "@/lib/push/native/push-route-native-bridge";
import { shouldReplaceRoute } from "@/lib/push/push-route-policy";
import { postNotificationEventOpenedRead } from "@/lib/notifications/client/notification-event-read-client";
import { shouldApplyMemberNotificationReadOnPushTap } from "@/lib/notifications/badge-authority-rebuild/push-routing-transport";
import { removeDeliveredNotificationOnPushTap } from "@/lib/push/native/remove-delivered-notifications";
import { suppressCmRoomEntryNotificationSound } from "@/lib/community-messenger/notifications/cm-participant-surface-sync";
import { callEngineActions } from "@/lib/community-messenger/call-engine";
import { isDibayCallV3SafeLaneEnabled } from "@/lib/community-messenger/call-v3/call-v3-flag";
import { isCallV4TelegramLaneEnabled } from "@/lib/community-messenger/call-v4/call-v4-flag";
import { isLegacyWebCallEstablishmentRemoved } from "@/lib/call/native/legacy-web-call-establishment-removed";
import {
  isCallV4CallRoute,
  isCallV4CalleeAcceptRoute,
  isCallV4CalleeRejectRoute,
} from "@/lib/community-messenger/call-v4/call-v4-native-route";
import { handleCallV3NativeCallRoute } from "@/lib/community-messenger/call-v3/call-v3-native-bridge";
import { isCallV3CalleeAcceptRoute, isCallV3CalleeRejectRoute } from "@/lib/push/native/call-v3-native-route";

const ROUTE_DEDUPE_MS = 2_000;
const NOTIFICATION_DEDUPE_MS = 60_000;
const NOTIFICATION_DEDUPE_KEY = "dibay_push_route_notification_ids";

function readCalleeAcceptSessionIdFromPath(path: string): string | null {
  const match = path.match(/^\/community-messenger\/calls\/([^/?#]+)/);
  const id = match?.[1] ? decodeURIComponent(match[1]).trim() : "";
  return id || null;
}

function isCalleeAcceptPushRoute(path: string): boolean {
  return path.includes("action=accept") || path.includes("callAction=accept");
}

function isNativeAcceptPatchCompleteRoute(path: string): boolean {
  return path.includes("nativeAccept=1");
}

function isCallRoute(path: string): boolean {
  return path.startsWith("/community-messenger/calls/");
}

type PushRouteDetail = {
  path?: string;
  notificationId?: string;
  /** Gate 3 Step 9 transport wire (optional; path heuristics if absent). */
  recipientScope?: string;
  pipeline?: string;
  type?: string;
};

function maybeMarkMemberAOnPushTap(
  path: string,
  notificationId: string | undefined,
  transport?: Pick<PushRouteDetail, "recipientScope" | "pipeline" | "type">
): void {
  const id = notificationId?.trim();
  if (!id) return;
  if (
    !shouldApplyMemberNotificationReadOnPushTap({
      path,
      recipientScope: transport?.recipientScope,
      pipeline: transport?.pipeline,
      type: transport?.type,
    })
  ) {
    return;
  }
  void postNotificationEventOpenedRead(id);
}

function readNotificationDedupe(): Map<string, number> {
  if (typeof window === "undefined") return new Map();
  try {
    const raw = sessionStorage.getItem(NOTIFICATION_DEDUPE_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as Record<string, number>;
    return new Map(Object.entries(parsed));
  } catch {
    return new Map();
  }
}

function writeNotificationDedupe(map: Map<string, number>): void {
  if (typeof window === "undefined") return;
  const now = Date.now();
  const pruned = Object.fromEntries(
    [...map.entries()].filter(([, at]) => now - at < NOTIFICATION_DEDUPE_MS)
  );
  sessionStorage.setItem(NOTIFICATION_DEDUPE_KEY, JSON.stringify(pruned));
}

function shouldIgnoreNotification(notificationId: string | undefined): boolean {
  const id = notificationId?.trim();
  if (!id) return false;
  const map = readNotificationDedupe();
  const prev = map.get(id);
  const now = Date.now();
  if (prev != null && now - prev < NOTIFICATION_DEDUPE_MS) {
    console.info("[push-route] duplicate_ignored", { notificationId: id });
    return true;
  }
  map.set(id, now);
  writeNotificationDedupe(map);
  return false;
}

/**
 * AUTH RESOLUTION GATE for push / deep-link destinations.
 *
 * loading / recovering ≠ unauthenticated — hold destination until phase settles.
 * Only terminal_guest / corrupt may open the login sheet.
 */
export function resolvePushAuthGate(
  phase: DibaySessionPhase,
  path: string
): "allow" | "hold" | "login" {
  if (!isAuthRequiredPushRoute(path)) return "allow";
  if (phase === "authenticated") return "allow";
  if (isRecoveringPhase(phase)) return "hold";
  if (phase === "terminal_guest" || phase === "corrupt") return "login";
  return "hold";
}

/**
 * Native FCM notification tap / dibay deep link → Next.js router navigation.
 * Call accept routes delegate to single accept gateway (no PATCH-less replace).
 */
export function PushRouteListener() {
  const router = useRouter();
  const lastRouteRef = useRef<{ path: string; at: number } | null>(null);
  const sessionPhaseRef = useRef(getSessionPhase());
  const navigateRef = useRef<
    | ((
        rawPath: string,
        notificationId?: string,
        transport?: Pick<PushRouteDetail, "recipientScope" | "pipeline" | "type">,
        opts?: { skipNotificationDedupe?: boolean }
      ) => void)
    | null
  >(null);

  useEffect(() => {
    return subscribeSessionPhase((phase) => {
      sessionPhaseRef.current = phase;
      if (phase !== "authenticated") return;
      const pending = readPendingPushRoute();
      if (!pending?.path) return;
      console.info("[push-route] auth_resolved_replay", { path: pending.path, phase });
      navigateRef.current?.(pending.path, pending.notificationId ?? undefined, undefined, {
        skipNotificationDedupe: true,
      });
    });
  }, []);

  useLayoutEffect(() => {
    if (!isCapacitorNativePlatform()) return;

    const navigate = (
      rawPath: string,
      notificationId?: string,
      transport?: Pick<PushRouteDetail, "recipientScope" | "pipeline" | "type">,
      opts?: { skipNotificationDedupe?: boolean }
    ) => {
      const path = rawPath.trim();
      if (!path.startsWith("/")) return;
      if (!opts?.skipNotificationDedupe && shouldIgnoreNotification(notificationId)) return;

      suppressCmRoomEntryNotificationSound(path);

      const now = Date.now();
      const last = lastRouteRef.current;
      if (last && last.path === path && now - last.at < ROUTE_DEDUPE_MS && !opts?.skipNotificationDedupe) {
        console.info("[push-route] duplicate_ignored", { path });
        return;
      }
      lastRouteRef.current = { path, at: now };

      console.info("[push-route] route_resolved", { path, notificationId: notificationId ?? null });

      void removeDeliveredNotificationOnPushTap({
        notificationId: notificationId ?? null,
        data: {
          notificationId: notificationId ?? undefined,
          eventId: notificationId ?? undefined,
        },
      });

      const authGate = resolvePushAuthGate(sessionPhaseRef.current, path);
      if (authGate === "hold") {
        writePendingPushRoute({
          path,
          notificationId: notificationId ?? null,
          at: Date.now(),
          source: "auth_resolution_hold",
          fallbackReason: sessionPhaseRef.current,
        });
        console.info("[push-route] auth_resolution_hold", {
          path,
          phase: sessionPhaseRef.current,
        });
        return;
      }
      if (authGate === "login") {
        writePendingPushRoute({
          path,
          notificationId: notificationId ?? null,
          at: Date.now(),
          source: "auth_required_login",
          fallbackReason: sessionPhaseRef.current,
        });
        openLoginRequiredSheet({ actionType: "messenger_open", next: path });
        return;
      }

      if (isCallV4TelegramLaneEnabled() && isCallRoute(path)) {
        clearPendingPushRoute();
        void clearNativePersistedPendingPushRoute();
        console.info("[DIBAY_CALL_V4] v3_call_route_suppressed", { path });
        return;
      }

      if (isCallV4TelegramLaneEnabled() && isCallV4CallRoute(path)) {
        if (isLegacyWebCallEstablishmentRemoved()) {
          clearPendingPushRoute();
          void clearNativePersistedPendingPushRoute();
          console.info("[DIBAY_CALL_V4] legacy_web_establishment_removed", { path });
          return;
        }
        if (shouldReplaceRoute(path) || isCallV4CalleeAcceptRoute(path) || isCallV4CalleeRejectRoute(path)) {
          router.replace(path);
        } else {
          router.push(path);
        }
        clearPendingPushRoute();
        void clearNativePersistedPendingPushRoute();
        console.info("[DIBAY_CALL_V4] v4_route_delivered", { path });
        return;
      }

      if (isDibayCallV3SafeLaneEnabled() && isCallRoute(path)) {
        handleCallV3NativeCallRoute(path, { source: "notification_tap" });

        if (isCallV3CalleeAcceptRoute(path) && shouldReplaceRoute(path)) {
          router.replace(path);
        } else if (!isCallV3CalleeAcceptRoute(path) && !isCallV3CalleeRejectRoute(path)) {
          if (shouldReplaceRoute(path)) {
            router.replace(path);
          } else {
            router.push(path);
          }
        }
        maybeMarkMemberAOnPushTap(path, notificationId, transport);
        clearPendingPushRoute();
        void clearNativePersistedPendingPushRoute();
        console.info("[push-route] webview_route_delivered", { path, via: "call_v3_wake" });
        return;
      }

      if (isCallRoute(path) && isCalleeAcceptPushRoute(path)) {
        const acceptSessionId = readCalleeAcceptSessionIdFromPath(path);
        if (acceptSessionId) {
          if (isNativeAcceptPatchCompleteRoute(path)) {
            router.replace(path);
            console.info("[push-route] webview_route_delivered", { path, via: "accept_route_active" });
          } else {
            void runNativePendingAcceptCall(router, acceptSessionId, "native_notification_accept").then(
              (result) => {
                console.info("[push-route] native_pending_accept_done", {
                  sessionId: acceptSessionId,
                  ok: result.ok,
                  reason: result.reason,
                });
              }
            );
            console.info("[push-route] webview_route_delivered", { path, via: "native_pending_accept" });
          }
          clearPendingPushRoute();
          void clearNativePersistedPendingPushRoute();
          return;
        }
      }

      if (isCallRoute(path) && shouldReplaceRoute(path)) {
        const sid = readCalleeAcceptSessionIdFromPath(path);
        if (sid) {
          if (!callEngineActions.replaceRouteOnce(router, sid, path)) {
            router.replace(path);
          }
        } else {
          router.replace(path);
        }
      } else if (shouldReplaceRoute(path)) {
        router.replace(path);
      } else {
        router.push(path);
      }
      maybeMarkMemberAOnPushTap(path, notificationId, transport);
      clearPendingPushRoute();
      void clearNativePersistedPendingPushRoute();
      console.info("[push-route] webview_route_delivered", { path });
    };

    navigateRef.current = navigate;

    const consumePendingRoutes = async () => {
      const sessionPending = readPendingPushRoute();
      if (sessionPending) {
        console.info("[push-route] pending_route_replayed", { path: sessionPending.path, source: "session" });
        navigate(sessionPending.path, sessionPending.notificationId ?? undefined);
        return;
      }
      const nativePending = await readNativePersistedPendingPushRoute();
      if (nativePending) {
        console.info("[push-route] pending_route_replayed", { path: nativePending.path, source: "native" });
        navigate(nativePending.path, nativePending.notificationId ?? undefined);
      }
    };

    void consumePendingRoutes();

    const onPushRoute = (event: Event) => {
      const detail = (event as CustomEvent<PushRouteDetail>).detail;
      const path = detail?.path?.trim();
      if (!path) return;
      console.info("[push-route] notification_tap_received", {
        path,
        notificationId: detail.notificationId ?? null,
      });
      navigate(path, detail.notificationId, {
        recipientScope: detail.recipientScope,
        pipeline: detail.pipeline,
        type: detail.type,
      });
    };

    window.addEventListener("dibay:push-route", onPushRoute);

    let removeAppUrlOpen: (() => void) | undefined;
    let removePushTap: (() => void) | undefined;
    void (async () => {
      try {
        const { App } = await import("@capacitor/app");
        const sub = await App.addListener("appUrlOpen", (event) => {
          const url = event.url?.trim() ?? "";
          if (!url.startsWith("dibay://")) return;
          if (url.startsWith("dibay://auth")) return;
          const path = resolveDibayDeepLinkToAppPath(url);
          if (!path) return;
          navigate(path);
        });
        removeAppUrlOpen = () => {
          void sub.remove();
        };
      } catch {
        /* Capacitor App plugin unavailable */
      }
    })();

    void (async () => {
      try {
        const { PushNotifications } = await import("@capacitor/push-notifications");
        const sub = await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
          const rawData =
            action.notification?.data && typeof action.notification.data === "object"
              ? (action.notification.data as Record<string, unknown>)
              : null;
          if (!rawData) return;
          const data = normalizeNativePushTapData(rawData);
          const notificationId =
            (typeof data.notificationId === "string" && data.notificationId.trim()) ||
            (typeof data.notificationEventId === "string" && data.notificationEventId.trim()) ||
            action.notification?.id?.trim() ||
            undefined;

          void (async () => {
            const { getBoundAuthUserId } = await import("@/lib/auth/client-instance-id");
            const {
              canPresentAuthenticatedNotification,
              resolvePushPayloadRecipientUserId,
            } = await import("@/lib/push/native/can-present-authenticated-notification");
            const phase = sessionPhaseRef.current;

            // Resolve target first — never lose a valid support/canonical route to auth race.
            const path = resolvePushRouteFromFcmData(data);
            if (!path) return;

            /**
             * Fail-closed identity only on settled phases.
             * loading/recovering must HOLD via resolvePushAuthGate (pending replay),
             * not DROP — otherwise cold-start APNS tap falls through to inbox fallback UX.
             */
            if (!isRecoveringPhase(phase)) {
              const decision = canPresentAuthenticatedNotification({
                memberEventEligible: phase === "authenticated",
                boundUserId: getBoundAuthUserId(),
                payloadRecipientUserId: resolvePushPayloadRecipientUserId(data),
              });
              if (!decision.ok) {
                console.info("[push-route] notification_tap_dropped", {
                  reason: decision.reason,
                  phase,
                  notificationId: notificationId ?? null,
                  path,
                });
                return;
              }
            }

            console.info("[push-route] notification_tap_received", {
              path,
              notificationId: notificationId ?? null,
              via: "capacitor_push_action",
              phase,
            });
            navigate(path, notificationId, {
              recipientScope: data.recipientScope,
              pipeline: data.pipeline,
              type: data.type ?? data.eventType,
            });
          })();
        });
        removePushTap = () => {
          void sub.remove();
        };
      } catch {
        /* Capacitor PushNotifications plugin unavailable */
      }
    })();

    return () => {
      window.removeEventListener("dibay:push-route", onPushRoute);
      removeAppUrlOpen?.();
      removePushTap?.();
      navigateRef.current = null;
    };
  }, [router]);

  return null;
}
