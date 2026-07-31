"use client";

import { useEffect, useRef, useState } from "react";
import {
  attachVoipPushTokenListener,
  isVoipPushTokenListenerAttached,
  registerNativePushFromClient,
  retryVoipTokenRegistration,
} from "@/lib/push/native/register-native-push-client";
import {
  hasAndroidBridge,
  isCapacitorNativePlatform,
  resolveCapacitorShellPlatform,
  waitForCapacitorBridgeReady,
} from "@/lib/platform/capacitor-native";
import { getSessionPhase, subscribeDibayAuthStateChange, subscribeSessionPhase } from "@/lib/auth/dibay-session-manager";
import { allowsPushRegistration, isTerminalGuestPhase, type DibaySessionPhase } from "@/lib/auth/dibay-session-policy";
import { getCurrentUser, getCurrentUserIdForDb } from "@/lib/auth/get-current-user";
import { logGuestAuthBootMarker } from "@/lib/auth/guest-auth-boot-markers";
import {
  logPushRegister,
  logPushRegisterFail,
  logPushRegisterMountContext,
} from "@/lib/push/native/native-push-register-log";
import { prepareDeviceRegisterAfterLogin } from "@/lib/push/device-register/register-device-once";
import {
  ensureNotificationForPushRegister,
  getCachedNotificationReceiveSnapshot,
  subscribeNotificationPermissionSnapshot,
} from "@/lib/permissions/permission-manager/notification-permission-manager";
import { DIBAY_POST_LOGIN_ONBOARDING_PROFILE_RETRY_EVENT } from "@/lib/permissions/dibay-post-login-onboarding-gate";

const MAX_USER_ID_WAIT_ATTEMPTS = 8;
const MAX_REGISTER_ATTEMPTS = 3;
const VOIP_LISTENER_BRIDGE_READY_TIMEOUT_MS = 5_000;

/**
 * Native FCM/APNS — authenticated phase only.
 * Push register is independent of UI onboarding; check-only permission (no OS request).
 * DO NOT await onboarding settle — VoIP already registers without it; waiting forever when
 * post-login gate early-returns left Production with voip_apns only and zero alert apns.
 */
export function NativePushRegistration() {
  const [phase, setPhase] = useState<DibaySessionPhase>(() => getSessionPhase());
  const attemptedUserIdRef = useRef<string | null>(null);
  const sessionUserIdRef = useRef<string | null>(null);
  const registerInFlightRef = useRef(false);
  const registerRunIdRef = useRef(0);
  const registerFnRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!isCapacitorNativePlatform()) return;
    logPushRegisterMountContext();
  }, []);

  useEffect(() => subscribeSessionPhase(setPhase), []);

  useEffect(() => {
    if (phase === "authenticated") {
      logPushRegister("session_authenticated", { phase: "authenticated" });
    }
  }, [phase]);

  useEffect(() => {
    if (hasAndroidBridge() || resolveCapacitorShellPlatform() === "android") return;

    let cancelled = false;
    let detachVoip: () => void = () => {};

    const tryAttachVoip = (reason: string) => {
      if (cancelled || isVoipPushTokenListenerAttached()) return;
      logPushRegister("voip_listener_attach_attempt", { reason });
      detachVoip = attachVoipPushTokenListener();
    };

    tryAttachVoip("mount");
    void waitForCapacitorBridgeReady({ timeoutMs: VOIP_LISTENER_BRIDGE_READY_TIMEOUT_MS }).then((ready) => {
      if (cancelled) return;
      logPushRegister("voip_listener_bridge_ready", { ready });
      tryAttachVoip(ready ? "bridge_ready" : "bridge_timeout");
    });

    return () => {
      cancelled = true;
      detachVoip();
    };
  }, []);

  useEffect(() => {
    if (!isCapacitorNativePlatform()) return;

    if (phase === "recovering") {
      logGuestAuthBootMarker("push_register_deferred_recovering", { phase });
      return;
    }

    if (!allowsPushRegistration(phase)) {
      if (isTerminalGuestPhase(phase) || phase === "corrupt") {
        logGuestAuthBootMarker("push_register_skipped_terminal_guest", { phase });
        attemptedUserIdRef.current = null;
        sessionUserIdRef.current = null;
      }
      return;
    }

    let cancelled = false;
    const runId = ++registerRunIdRef.current;

    const resolveUserId = async (): Promise<string> => {
      const cached = getCurrentUser()?.id?.trim() ?? "";
      if (cached) return cached;
      return (await getCurrentUserIdForDb())?.trim() ?? "";
    };

    const resetForUserId = (userId: string, reason: string) => {
      const uid = userId.trim();
      if (!uid) return;
      const prev = sessionUserIdRef.current;
      if (prev === uid && attemptedUserIdRef.current === uid) return;
      if (prev !== uid) {
        sessionUserIdRef.current = uid;
        attemptedUserIdRef.current = null;
        prepareDeviceRegisterAfterLogin(uid);
        logPushRegister("session_authenticated", { user_id: uid, register_reset: reason });
      }
    };

    const attemptRegister = async (userAttempt: number, registerAttempt: number) => {
      if (cancelled || runId !== registerRunIdRef.current || registerInFlightRef.current) return;

      const cached = getCachedNotificationReceiveSnapshot();
      const pushCheck =
        cached?.receiveReady === true
          ? { ok: true as const, snapshot: cached }
          : await ensureNotificationForPushRegister();
      if (!pushCheck.ok) {
        logPushRegisterFail("permission_not_granted", {
          perm: pushCheck.snapshot.effectiveState,
          receiveReady: pushCheck.snapshot.receiveReady,
        });
        return;
      }

      const userId = await resolveUserId();
      if (!userId) {
        logPushRegisterFail("no_user_id", { userAttempt, phase });
        if (!cancelled && userAttempt + 1 < MAX_USER_ID_WAIT_ATTEMPTS) {
          window.setTimeout(() => void attemptRegister(userAttempt + 1, 0), 750 * (userAttempt + 1));
        }
        return;
      }

      resetForUserId(userId, "resolved");

      if (attemptedUserIdRef.current === userId) return;

      registerInFlightRef.current = true;
      logGuestAuthBootMarker("push_register_start_authenticated", { user_id: userId, registerAttempt });
      logPushRegister("session_authenticated", { user_id: userId, registerAttempt });
      const result = await registerNativePushFromClient(userId, "NativePushRegistration");
      registerInFlightRef.current = false;
      if (cancelled || runId !== registerRunIdRef.current) return;

      if (result.ok) {
        attemptedUserIdRef.current = userId;
        logGuestAuthBootMarker("push_register_success_authenticated", { user_id: userId });
        logGuestAuthBootMarker("user_device_active_after_login", { user_id: userId });
        if (resolveCapacitorShellPlatform() === "ios") {
          retryVoipTokenRegistration("apns_register_success", userId);
        }
        return;
      }

      if (result.error === "permission_not_granted") {
        return;
      }

      if (registerAttempt + 1 < MAX_REGISTER_ATTEMPTS) {
        window.setTimeout(
          () => void attemptRegister(userAttempt, registerAttempt + 1),
          2_000 * (registerAttempt + 1),
        );
      }
    };

    registerFnRef.current = () => {
      void attemptRegister(0, 0);
    };
    void attemptRegister(0, 0);

    const unsubSnapshot = subscribeNotificationPermissionSnapshot((snapshot) => {
      if (!snapshot.receiveReady || registerInFlightRef.current) return;
      if (attemptedUserIdRef.current != null) return;
      registerFnRef.current?.();
    });

    const unsubAuth = subscribeDibayAuthStateChange((event, session) => {
      const uid = session?.user?.id?.trim() ?? "";
      if (!uid) return;
      if (event !== "SIGNED_IN" && event !== "INITIAL_SESSION") return;
      resetForUserId(uid, `auth:${event}`);
      registerFnRef.current?.();
    });

    const onProfileRetry = () => {
      registerFnRef.current?.();
    };
    window.addEventListener(DIBAY_POST_LOGIN_ONBOARDING_PROFILE_RETRY_EVENT, onProfileRetry);

    return () => {
      cancelled = true;
      unsubSnapshot();
      unsubAuth();
      window.removeEventListener(DIBAY_POST_LOGIN_ONBOARDING_PROFILE_RETRY_EVENT, onProfileRetry);
    };
  }, [phase]);

  return null;
}
