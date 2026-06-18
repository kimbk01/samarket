"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getCurrentUser, getCurrentUserIdForDb } from "@/lib/auth/get-current-user";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import {
  hardClearActiveCallSession,
  readActiveCallSessionSnapshot,
  resumeActiveCallSessionFromNative,
  subscribeActiveCallSession,
} from "@/lib/call/active-call-session";
import { mapSessionStatusToActiveCallPhase, mapSessionStatusToMachinePhase } from "@/lib/call/map-session-to-active-call";
import { readNativeActiveCallId, readNativeActiveCallSnapshot } from "@/lib/call/native/native-call-service";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";
import {
  fetchActiveDirectCallSessionForRecovery,
  isTerminalCallRecoveryStatus,
  resolveActiveCallRecoveryTarget,
  shouldSkipActiveCallRecoveryRouting,
  writeActiveCallRecoveryLock,
} from "@/lib/community-messenger/call-active-session-recovery";
import {
  readActiveDirectVideoCallSessionId,
  readMinimizedCommunityCallSessionId,
} from "@/lib/community-messenger/direct-call-minimize";
import { appendDibayCallQaLog } from "@/lib/call/qa/dibay-call-qa-log";
import { logDibayCall } from "@/lib/community-messenger/call-orchestrator";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";
import { getSupabaseClient } from "@/lib/supabase/client";

const MAX_RECOVERY_ATTEMPTS = 2;

async function fetchCallSessionForResume(callId: string): Promise<CommunityMessengerCallSession | null> {
  const sid = callId.trim();
  if (!sid) return null;
  const res = await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(sid)}`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    session?: CommunityMessengerCallSession | null;
  };
  if (!json.ok || !json.session?.id) return null;
  return json.session;
}

/**
 * 새로고침·재실행·native active call 시 live 1:1 통화 화면 복구.
 */
export function CallActiveSessionRecoveryHost() {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const attemptCountRef = useRef(0);
  const routedRef = useRef(false);
  const inFlightRef = useRef(false);

  useEffect(() => {
    routedRef.current = false;
    attemptCountRef.current = 0;
    inFlightRef.current = false;
  }, [pathname]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let cancelled = false;

    const routeToCall = (targetSid: string, source: string) => {
      if (shouldSkipActiveCallRecoveryRouting(targetSid)) {
        routedRef.current = true;
        return;
      }
      writeActiveCallRecoveryLock(targetSid);
      routedRef.current = true;
      const href = `/community-messenger/calls/${encodeURIComponent(targetSid)}`;
      if (source.includes("native")) {
        logDibayCall("notification_resume_route", {
          sessionId: targetSid,
          callId: targetSid,
          path: href,
          source,
        });
      }
      router.replace(href);
      appendDibayCallQaLog({
        step: "active_call_screen_restored",
        callId: targetSid,
        extra: { source, href },
      });
    };

    const tryRecovery = async (reason: "initial" | "auth_ready"): Promise<void> => {
      if (cancelled || routedRef.current || inFlightRef.current) return;
      if (pathname.startsWith("/community-messenger/calls/")) return;
      if (readMinimizedCommunityCallSessionId() || readActiveDirectVideoCallSessionId()) {
        routedRef.current = true;
        return;
      }
      if (attemptCountRef.current >= MAX_RECOVERY_ATTEMPTS) return;

      const syncUserId = getCurrentUser()?.id?.trim();
      if (!syncUserId && reason === "initial") {
        return;
      }

      const userId = syncUserId || (await getCurrentUserIdForDb())?.trim();
      if (!userId || cancelled) return;

      attemptCountRef.current += 1;
      inFlightRef.current = true;
      try {
        if (isCapacitorNativePlatform()) {
          const snapshot = await readNativeActiveCallSnapshot();
          const nativeCallId = (snapshot?.callId ?? (await readNativeActiveCallId()))?.trim();
          if (nativeCallId && !cancelled && !routedRef.current) {
            logDibayCall("active_call_resume_check", {
              sessionId: nativeCallId,
              callId: nativeCallId,
              phase: snapshot?.phase ?? "unknown",
            });
            const nativeSession = await fetchCallSessionForResume(nativeCallId);
            const nativeStatus = nativeSession?.status?.trim().toLowerCase() ?? "";
            if (nativeSession && !isTerminalCallRecoveryStatus(nativeStatus)) {
              appendDibayCallQaLog({
                step: "active_call_resume_found",
                callId: nativeCallId,
                extra: { source: "native_resume" },
              });
              const joined = nativeStatus === "active";
              const phase = mapSessionStatusToActiveCallPhase(nativeSession, joined);
              if (phase !== "idle") {
                resumeActiveCallSessionFromNative({
                  callId: nativeSession.id,
                  roomId: nativeSession.roomId,
                  peerUserId: nativeSession.peerUserId,
                  role: nativeSession.isMineInitiator ? "caller" : "callee",
                  mediaType: nativeSession.callKind,
                  phase,
                  machinePhase: mapSessionStatusToMachinePhase(nativeSession, joined),
                  connected: joined,
                });
              }
              routeToCall(nativeSession.id, "native_resume");
              return;
            }
            if (nativeStatus && isTerminalCallRecoveryStatus(nativeStatus)) {
              await hardClearActiveCallSession(nativeCallId, "native_stale_terminal");
            }
          }
        }

        const session = await fetchActiveDirectCallSessionForRecovery();
        if (cancelled || routedRef.current) return;

        const targetSid = resolveActiveCallRecoveryTarget(session, pathname);
        if (!targetSid) {
          const existing = readActiveCallSessionSnapshot();
          if (existing && !pathname.startsWith("/community-messenger/calls/")) {
            await hardClearActiveCallSession(existing.callId, "recovery_no_live_session");
          }
          return;
        }

        if (session && !isTerminalCallRecoveryStatus(session.status ?? "")) {
          const full = await fetchCallSessionForResume(targetSid);
          if (full) {
            const phase = mapSessionStatusToActiveCallPhase(full, full.status === "active");
            if (phase !== "idle") {
              setActiveFromServer(full, phase);
            }
          }
        }

        routeToCall(targetSid, "server_active_recovery");
      } catch {
        /* ignore */
      } finally {
        inFlightRef.current = false;
      }
    };

    void tryRecovery("initial");

    const onAuthReady = () => {
      if (attemptCountRef.current >= MAX_RECOVERY_ATTEMPTS) return;
      void tryRecovery("auth_ready");
    };

    window.addEventListener(TEST_AUTH_CHANGED_EVENT, onAuthReady);

    const sb = getSupabaseClient();
    const authSub = sb?.auth.onAuthStateChange((event, session) => {
      if (session?.user?.id && (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "TOKEN_REFRESHED")) {
        onAuthReady();
      }
    });

    const retryTimer = window.setTimeout(() => {
      if (attemptCountRef.current < MAX_RECOVERY_ATTEMPTS && !routedRef.current) {
        void (async () => {
          await getCurrentUserIdForDb();
          if (!cancelled) onAuthReady();
        })();
      }
    }, 1_200);

    const offSession = subscribeActiveCallSession(() => {
      /* rerender hook for future UI — recovery is pathname driven */
    });

    return () => {
      cancelled = true;
      offSession();
      window.clearTimeout(retryTimer);
      window.removeEventListener(TEST_AUTH_CHANGED_EVENT, onAuthReady);
      authSub?.data.subscription.unsubscribe();
    };
  }, [pathname, router]);

  return null;
}

function setActiveFromServer(
  session: CommunityMessengerCallSession,
  phase: Exclude<import("@/lib/call/active-call-session").ActiveCallSessionPhase, "idle">,
): void {
  resumeActiveCallSessionFromNative(
    {
      callId: session.id,
      roomId: session.roomId,
      peerUserId: session.peerUserId,
      role: session.isMineInitiator ? "caller" : "callee",
      mediaType: session.callKind,
      phase,
    },
    "server_recovery",
  );
}
