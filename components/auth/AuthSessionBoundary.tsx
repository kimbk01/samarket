"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { isAccountDependentPath } from "@/lib/auth/auth-route-classification";
import {
  isAuthExitNavigateStarted,
  runAuthAccountSwitchExit,
  runAuthRequiredExit,
  runAuthSessionExpiredExit,
} from "@/lib/auth/auth-exit-coordinator";
import {
  isMessengerRoomOrCallPath,
  shouldBlockPrivateTreeForAuthSession,
} from "@/lib/auth/auth-session-boundary-gate";
import { exposeResetAuthStateForDev } from "@/lib/auth/reset-auth-state";
import { getSessionPhase } from "@/lib/auth/dibay-session-manager";
import { isRecoveringPhase } from "@/lib/auth/dibay-session-policy";
import { useClientMembershipState } from "@/hooks/use-client-membership-state";
import {
  isMessengerRoomPreShellBackPath,
  MessengerRoomPreShellBackOwner,
} from "@/components/community-messenger/room/MessengerRoomPreShellBackOwner";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  noteAuthSessionClientOk,
  peekAuthSessionClientOk,
  trackAuthSessionBoundaryProbe,
} from "@/lib/auth/fetch-auth-session-client";

type Props = {
  children: ReactNode;
};

/**
 * account-dependent 경로 — membership resolve 완료 전까지 private UI 렌더 금지.
 * guest 는 auth_required, corrupt 만 session_expired.
 * recovering/loading ≠ guest — login exit 금지.
 *
 * SSOT: `/api/auth/session` (or supabase getSession) already authenticated ⇒
 * never pin standalone Loading… forever (messenger dual-context hang root).
 */
export function AuthSessionBoundary({ children }: Props) {
  const { t } = useI18n();
  const pathname = usePathname() ?? "";
  const membership = useClientMembershipState("auth-session-boundary");
  const lastUserIdRef = useRef<string | null>(null);
  const dependent = isAccountDependentPath(pathname);
  /**
   * Hard-nav cookie/membership race can leave status=checking while
   * `/api/auth/session` already reports authenticated — without this fail-open,
   * messenger room re-entry stays on standalone Loading… and gift cards never mount.
   */
  const [sessionApiAuthenticated, setSessionApiAuthenticated] = useState(false);

  useEffect(() => {
    exposeResetAuthStateForDev();
  }, []);

  useEffect(() => {
    if (!dependent) {
      lastUserIdRef.current = null;
      return;
    }
    if (membership.status === "checking") return;
    if (isAuthExitNavigateStarted()) return;

    const phase = getSessionPhase();
    if (phase === "corrupt") {
      void runAuthSessionExpiredExit();
      return;
    }
    // Hydration / unexpected SIGNED_OUT recovery — never flash login.
    if (isRecoveringPhase(phase) || phase === "authenticated") {
      return;
    }

    if (membership.status === "guest") {
      // Session cookie still valid — do not force login exit; fail-open renders children.
      if (sessionApiAuthenticated) return;
      void runAuthRequiredExit();
      return;
    }

    const userId = membership.profile.id.trim();
    if (lastUserIdRef.current && lastUserIdRef.current !== userId) {
      void runAuthAccountSwitchExit();
    }
    lastUserIdRef.current = userId;
  }, [dependent, membership, sessionApiAuthenticated]);

  useEffect(() => {
    if (!dependent) {
      setSessionApiAuthenticated(false);
      return;
    }
    if (membership.status === "member") {
      setSessionApiAuthenticated(true);
      return;
    }
    // 세션 API·클라이언트 세션이 이미 「로그인됨」을 확인했으면 더 묻지 않는다.
    // probe 는 true 로만 바꾸므로 확인 뒤 1초 반복은 상태를 바꾸지 않고 요청만 늘렸다.
    if (sessionApiAuthenticated) return;
    let cancelled = false;
    const probe = () => {
      // 설계 §24 D5 (Auth HARD LOCK Amendment 2026-11-18): 다른 세션 확인이 3초 안에 「로그인됨」을 확인했으면 요청하지 않고 같은 결과를 쓴다.
      if (peekAuthSessionClientOk()) {
        void Promise.resolve().then(() => {
          if (!cancelled) setSessionApiAuthenticated(true);
        });
        return;
      }
      const request = fetch("/api/auth/session", { credentials: "include" }).then(async (res) => {
        const json = (await res.json().catch(() => null)) as { authenticated?: boolean } | null;
        const authenticated = res.ok && json?.authenticated === true;
        // 같은 확인 결과를 공용 캐시에 남겨 뒤따르는 세션 확인(`fetchAuthSessionNoStore`)이 다시 묻지 않게 한다(화면이 사라져도 결과는 사실).
        if (authenticated) noteAuthSessionClientOk();
        if (!cancelled && authenticated) setSessionApiAuthenticated(true);
        return authenticated;
      });
      // 설계 §24 D5 보완: 진행 중인 이 확인에 공용 조회가 합류한다(같은 순간 두 번 묻지 않음).
      trackAuthSessionBoundaryProbe(request);
      void request.catch(() => {
        /* ignore — keep holding */
      });
      // Registry/cookie race: session API may 401 while the browser still has a Supabase session.
      void getSupabaseClient()
        ?.auth.getSession()
        .then((result) => {
          const uid = result?.data?.session?.user?.id?.trim();
          if (!cancelled && uid) setSessionApiAuthenticated(true);
        })
        .catch(() => {
          /* ignore */
        });
    };
    probe();
    const id = window.setInterval(probe, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [dependent, membership.status, pathname, sessionApiAuthenticated]);

  if (!dependent) {
    return <>{children}</>;
  }

  const phase = getSessionPhase();
  /**
   * Store Manager `/stores/owner/**` — AuthSessionBoundary must not replace the tree
   * with standalone `Loading…`. Owner Shell (`data-biz`) + StoreBusinessGuard own gate UX.
   * Use `window.location.pathname` — hard/APK first paint can have empty `usePathname()`.
   */
  const pathForOwnerGate =
    (pathname && pathname.trim()) ||
    (typeof window !== "undefined" ? window.location.pathname : "");
  const isOwnerAdminRoute =
    pathForOwnerGate === "/stores/owner" || pathForOwnerGate.startsWith("/stores/owner/");
  /**
   * Delivery Activity Hub — thin Link shell only. Middleware already requires auth.
   * Do not replace with standalone `Loading…` while membership is checking (APK/cold paint).
   */
  const isDeliveryActivityHub = pathForOwnerGate === "/orders/activity";
  if ((isOwnerAdminRoute || isDeliveryActivityHub) && !isAuthExitNavigateStarted()) {
    return <>{children}</>;
  }

  /**
   * FAIL-2 — 메신저 방 경로(통화 경로 제외)에서만 ◁ 주인 요소를 화면 뒤 형제로 둔다. 차단 화면 동안 등록(active)하고,
   * 차단이 풀려도 같은 자리에 남아 방 셸이 칸을 가져갈 때까지 주인을 유지한다(셸 전 Suspense 구간 포함, 리스너 재설치 없음).
   * 인증 종료 이동 중에는 그리지 않는다(언마운트 = 자기 등록 해제). 그 밖 경로의 반환은 main 과 같다.
   */
  const roomPreShellBackSlot =
    isMessengerRoomPreShellBackPath(pathForOwnerGate) && !isAuthExitNavigateStarted();

  /**
   * Messenger room/call — middleware already requires auth. Same fail-open as owner shell:
   * never replace with Loading… once session cookie/API says authenticated.
   */
  if (
    isMessengerRoomOrCallPath(pathForOwnerGate) &&
    sessionApiAuthenticated &&
    !isAuthExitNavigateStarted()
  ) {
    if (roomPreShellBackSlot) {
      return (
        <>
          {children}
          <MessengerRoomPreShellBackOwner active={false} />
        </>
      );
    }
    return <>{children}</>;
  }

  const holdForRecovery =
    membership.status === "checking" ||
    isRecoveringPhase(phase) ||
    (membership.status === "guest" && phase !== "terminal_guest" && phase !== "corrupt");

  const membershipStatus =
    membership.status === "member"
      ? ("member" as const)
      : membership.status === "guest"
        ? ("guest" as const)
        : ("checking" as const);

  const blockPrivateTree = shouldBlockPrivateTreeForAuthSession({
    sessionApiAuthenticated,
    membershipStatus,
    holdForRecovery,
    authExitStarted: isAuthExitNavigateStarted(),
  });

  if (blockPrivateTree) {
    const blockedScreen = (
      <div
        className="flex min-h-[40vh] items-center justify-center bg-sam-app px-4"
        aria-busy="true"
        data-auth-session-boundary="blocked"
      >
        <p className="sam-text-body text-sam-muted">{t("mypage_comp_loading_ellipsis")}</p>
      </div>
    );
    if (roomPreShellBackSlot) {
      return (
        <>
          {blockedScreen}
          <MessengerRoomPreShellBackOwner active />
        </>
      );
    }
    return blockedScreen;
  }

  if (roomPreShellBackSlot) {
    return (
      <>
        {children}
        <MessengerRoomPreShellBackOwner active={false} />
      </>
    );
  }
  return <>{children}</>;
}
