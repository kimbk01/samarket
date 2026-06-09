"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getCurrentUser, getCurrentUserIdForDb } from "@/lib/auth/get-current-user";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import {
  fetchActiveDirectCallSessionForRecovery,
  resolveActiveCallRecoveryTarget,
  shouldSkipActiveCallRecoveryRouting,
  writeActiveCallRecoveryLock,
} from "@/lib/community-messenger/call-active-session-recovery";
import {
  readActiveDirectVideoCallSessionId,
  readMinimizedCommunityCallSessionId,
} from "@/lib/community-messenger/direct-call-minimize";
import { getSupabaseClient } from "@/lib/supabase/client";

const MAX_RECOVERY_ATTEMPTS = 2;

/**
 * 새로고침·재실행 시 본인 active 1:1 통화가 있으면 전용 통화 화면으로 복구한다.
 * auth 준비 전 누락 방지 — 최대 2회 시도(Sync user → getUser / auth 이벤트).
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
        const session = await fetchActiveDirectCallSessionForRecovery();
        if (cancelled || routedRef.current) return;

        const targetSid = resolveActiveCallRecoveryTarget(session, pathname);
        if (!targetSid) return;

        if (shouldSkipActiveCallRecoveryRouting(targetSid)) {
          routedRef.current = true;
          return;
        }

        writeActiveCallRecoveryLock(targetSid);
        routedRef.current = true;
        router.replace(`/community-messenger/calls/${encodeURIComponent(targetSid)}`);
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

    return () => {
      cancelled = true;
      window.clearTimeout(retryTimer);
      window.removeEventListener(TEST_AUTH_CHANGED_EVENT, onAuthReady);
      authSub?.data.subscription.unsubscribe();
    };
  }, [pathname, router]);

  return null;
}
