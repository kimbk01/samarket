"use client";

import { useEffect, useRef, useState } from "react";
import { registerNativePushFromClient, attachVoipPushTokenListener } from "@/lib/push/native/register-native-push-client";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";
import { getSessionPhase, subscribeSessionPhase } from "@/lib/auth/dibay-session-manager";
import type { DibaySessionPhase } from "@/lib/auth/dibay-session-policy";
import { getCurrentUser, getCurrentUserIdForDb } from "@/lib/auth/get-current-user";
import {
  logPushRegister,
  logPushRegisterFail,
  logPushRegisterMountContext,
} from "@/lib/push/native/native-push-register-log";

const MAX_USER_ID_WAIT_ATTEMPTS = 8;
const MAX_REGISTER_ATTEMPTS = 3;

/**
 * 로그인 후 native FCM/APNS token 등록 (authenticated 세션·userId당 성공 1회).
 */
export function NativePushRegistration() {
  const [phase, setPhase] = useState<DibaySessionPhase>(() => getSessionPhase());
  const attemptedUserIdRef = useRef<string | null>(null);
  const registerRunIdRef = useRef(0);

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
    if (!isCapacitorNativePlatform()) return;
    const detachVoip = attachVoipPushTokenListener();
    return () => {
      detachVoip();
    };
  }, []);

  useEffect(() => {
    if (!isCapacitorNativePlatform()) return;
    if (phase !== "authenticated") {
      if (phase === "guest" || phase === "corrupt") {
        attemptedUserIdRef.current = null;
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

    const attemptRegister = async (userAttempt: number, registerAttempt: number) => {
      if (cancelled || runId !== registerRunIdRef.current) return;

      const userId = await resolveUserId();
      if (!userId) {
        logPushRegisterFail("no_user_id", { userAttempt, phase });
        if (!cancelled && userAttempt + 1 < MAX_USER_ID_WAIT_ATTEMPTS) {
          window.setTimeout(() => void attemptRegister(userAttempt + 1, 0), 750 * (userAttempt + 1));
        }
        return;
      }

      if (attemptedUserIdRef.current === userId) return;

      logPushRegister("session_authenticated", { user_id: userId, registerAttempt });
      const result = await registerNativePushFromClient(userId);
      if (cancelled || runId !== registerRunIdRef.current) return;

      if (result.ok) {
        attemptedUserIdRef.current = userId;
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

    void attemptRegister(0, 0);

    return () => {
      cancelled = true;
    };
  }, [phase]);

  return null;
}
