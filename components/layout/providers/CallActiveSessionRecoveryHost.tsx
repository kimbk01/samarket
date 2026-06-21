"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getCurrentUser, getCurrentUserIdForDb } from "@/lib/auth/get-current-user";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import { isCallActionLockHeld } from "@/lib/call/call-action-lock";
import {
  releaseLocalCallSession,
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
  shouldPreserveLocalActiveCallDuringRecovery,
  shouldSkipActiveCallRecoveryRouting,
  writeActiveCallRecoveryLock,
} from "@/lib/community-messenger/call-active-session-recovery";
import { ensureCallBootReconcile } from "@/lib/community-messenger/call-boot-reconcile";
import { resolveCallRouteResumeDecision } from "@/lib/community-messenger/call-route-resume-guard";
import {
  readDockedCallSessionId,
  readHostedActiveCallSessionId,
  readPipMinimizedCallSessionId,
} from "@/lib/community-messenger/call-presentation-ownership";
import { appendDibayCallQaLog } from "@/lib/call/qa/dibay-call-qa-log";
import {
  isIncomingCallSurfaceTerminal,
  isRingingOnlyIncomingCallRoute,
} from "@/lib/community-messenger/incoming-call-surface-owner";
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

    const routeToCall = async (targetSid: string, source: string, sessionStatus?: string | null) => {
      if (shouldSkipActiveCallRecoveryRouting(targetSid)) {
        routedRef.current = true;
        return;
      }
      if (isIncomingCallSurfaceTerminal(targetSid)) {
        routedRef.current = true;
        logDibayCall("stale_ringing_blocked", {
          sessionId: targetSid,
          callId: targetSid,
          source: "recovery_terminal_surface",
        });
        return;
      }
      const status = sessionStatus?.trim().toLowerCase() ?? "";
      if (status === "ringing") {
        routedRef.current = true;
        logDibayCall("stale_ringing_blocked", {
          sessionId: targetSid,
          callId: targetSid,
          source: "recovery_ringing_blocked",
        });
        return;
      }
      const href = `/community-messenger/calls/${encodeURIComponent(targetSid)}?source=native_resume`;
      const resumeDecision = await resolveCallRouteResumeDecision({ sessionId: targetSid, path: href });
      if (cancelled || resumeDecision.action === "block") {
        routedRef.current = true;
        if (resumeDecision.action === "block") {
          logDibayCall("stale_ringing_blocked", {
            sessionId: targetSid,
            callId: targetSid,
            source: `recovery_${resumeDecision.reason}`,
          });
        }
        return;
      }
      writeActiveCallRecoveryLock(targetSid);
      routedRef.current = true;
      if (isRingingOnlyIncomingCallRoute(href)) {
        logDibayCall("stale_ringing_blocked", {
          sessionId: targetSid,
          callId: targetSid,
          source: "recovery_ringing_route",
        });
        return;
      }
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
      if (readDockedCallSessionId() || readPipMinimizedCallSessionId() || readHostedActiveCallSessionId()) {
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
        await ensureCallBootReconcile().catch(() => {});

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
            if (nativeSession && nativeStatus === "active" && !isTerminalCallRecoveryStatus(nativeStatus)) {
              appendDibayCallQaLog({
                step: "active_call_resume_found",
                callId: nativeCallId,
                extra: { source: "native_resume" },
              });
              const phase = mapSessionStatusToActiveCallPhase(nativeSession, true);
              if (phase !== "idle") {
                resumeActiveCallSessionFromNative({
                  callId: nativeSession.id,
                  roomId: nativeSession.roomId,
                  peerUserId: nativeSession.peerUserId,
                  role: nativeSession.isMineInitiator ? "caller" : "callee",
                  mediaType: nativeSession.callKind,
                  phase,
                  machinePhase: mapSessionStatusToMachinePhase(nativeSession, true),
                  connected: true,
                });
              }
              void routeToCall(nativeSession.id, "native_resume", nativeSession.status);
              return;
            }
            if (nativeStatus === "ringing") {
              logDibayCall("stale_ringing_blocked", {
                sessionId: nativeCallId,
                callId: nativeCallId,
                source: "native_resume_ringing",
              });
              routedRef.current = true;
              return;
            }
            if (nativeStatus && isTerminalCallRecoveryStatus(nativeStatus)) {
              await releaseLocalCallSession(nativeCallId, "native_stale_terminal");
            }
          }
        }

        const session = await fetchActiveDirectCallSessionForRecovery();
        if (cancelled || routedRef.current) return;

        const targetSid = resolveActiveCallRecoveryTarget(session, pathname);
        if (!targetSid) {
          const existing = readActiveCallSessionSnapshot();
          if (existing && !pathname.startsWith("/community-messenger/calls/")) {
            if (
              shouldPreserveLocalActiveCallDuringRecovery(existing, {
                callActionLockHeld: isCallActionLockHeld(),
              })
            ) {
              logDibayCall("recovery_local_session_preserved", {
                sessionId: existing.callId,
                callId: existing.callId,
                phase: existing.phase,
                source: "recovery_no_live_session_blocked",
              });
              routedRef.current = true;
              return;
            }
            await releaseLocalCallSession(existing.callId, "recovery_no_live_session");
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
          void routeToCall(targetSid, "server_active_recovery", full?.status ?? session.status);
          return;
        }
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
