"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { App } from "@capacitor/app";
import {
  readNativeActiveCallId,
  readNativeActiveCallSnapshot,
} from "@/lib/call/native/native-call-service";
import { isNativeEstablishmentOwned } from "@/lib/call/native/native-outgoing-bridge";
import { isLegacyWebCallEstablishmentRemoved } from "@/lib/call/native/legacy-web-call-establishment-removed";
import { isCapacitorNativePlatform, resolveCapacitorShellPlatform } from "@/lib/platform/capacitor-native";
import {
  applyCallV4ForegroundResumeRestore,
  buildCallV4ForegroundResumeDedupeKey,
  evaluateCallV4ForegroundResume,
  logCallV4ForegroundResumeDetected,
  logCallV4ForegroundResumeSkip,
} from "@/lib/community-messenger/call-v4/call-v4-foreground-resume";
import { isCallV4TelegramLaneEnabled } from "@/lib/community-messenger/call-v4/call-v4-flag";
import { isCallV4DedicatedSessionPath } from "@/lib/community-messenger/call-v4/call-v4-session-path";
import { useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";

/** Connected V4 call — restore `/calls-v4/{callId}` after hub/background return. */
export function useCallV4ForegroundResume(): void {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const phase = useCallV4Store((s) => s.phase);
  const storeCallId = useCallV4Store((s) => s.identity?.callId ?? null);
  const inFlightRef = useRef(false);
  const lastRestoreKeyRef = useRef<string | null>(null);

  const attemptResume = useCallback(
    async (trigger: string) => {
      if (!isCallV4TelegramLaneEnabled() || inFlightRef.current) return;

      const callIdHint = storeCallId?.trim() ?? null;
      if (isLegacyWebCallEstablishmentRemoved()) {
        const snapshot = await readNativeActiveCallSnapshot();
        const nativeCallId = snapshot?.callId?.trim() || callIdHint;
        logCallV4ForegroundResumeSkip({
          callId: nativeCallId || null,
          reason: "legacy_web_establishment_removed",
          trigger,
          pathname,
        });
        return;
      }

      logCallV4ForegroundResumeDetected({
        callId: callIdHint,
        trigger,
        pathname,
        phase,
      });

      if (callIdHint && isCallV4DedicatedSessionPath(pathname, callIdHint)) {
        lastRestoreKeyRef.current = null;
        logCallV4ForegroundResumeSkip({
          callId: callIdHint,
          reason: "already_on_call_screen",
          trigger,
          pathname,
        });
        return;
      }

      inFlightRef.current = true;
      try {
        const nativeSnapshot = await readNativeActiveCallSnapshot();
        const nativeCallId = (nativeSnapshot?.callId ?? (await readNativeActiveCallId()))?.trim() ?? "";
        const nativeEstablishmentOwned =
          resolveCapacitorShellPlatform() === "ios" && nativeCallId
            ? await isNativeEstablishmentOwned(nativeCallId)
            : false;
        const dedupeKey = nativeCallId
          ? buildCallV4ForegroundResumeDedupeKey(nativeCallId, pathname)
          : null;

        const decision = evaluateCallV4ForegroundResume({
          phase,
          pathname,
          storeCallId: callIdHint,
          nativeCallId: nativeCallId || null,
          nativeSnapshot,
          dedupeKey,
          lastRestoreKey: lastRestoreKeyRef.current,
          nativeEstablishmentOwned,
        });

        if (decision.action === "skip") {
          logCallV4ForegroundResumeSkip({
            callId: decision.callId ?? callIdHint,
            reason: decision.reason,
            trigger,
            pathname,
          });
          return;
        }

        applyCallV4ForegroundResumeRestore({
          callId: decision.callId,
          href: decision.href,
          trigger,
        });
        router.replace(decision.href);
        lastRestoreKeyRef.current = dedupeKey;
      } finally {
        inFlightRef.current = false;
      }
    },
    [pathname, phase, router, storeCallId],
  );

  const scheduleAttempt = useCallback(
    (trigger: string) => {
      queueMicrotask(() => {
        void attemptResume(trigger);
      });
    },
    [attemptResume],
  );

  useEffect(() => {
    if (!isCallV4TelegramLaneEnabled()) return;
    scheduleAttempt("pathname_change");
  }, [pathname, phase, storeCallId, scheduleAttempt]);

  useEffect(() => {
    if (!isCallV4TelegramLaneEnabled() || typeof window === "undefined") return;

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        scheduleAttempt("visibility_visible");
      }
    };

    document.addEventListener("visibilitychange", onVisible);

    let removeAppListener: (() => void) | undefined;
    if (isCapacitorNativePlatform()) {
      void App.addListener("appStateChange", ({ isActive }) => {
        if (isActive) scheduleAttempt("app_state_active");
      }).then((handle) => {
        removeAppListener = () => {
          void handle.remove();
        };
      });
    }

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      removeAppListener?.();
    };
  }, [scheduleAttempt]);
}
