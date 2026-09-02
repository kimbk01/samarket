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
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getSupabaseClient } from "@/lib/supabase/client";

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
    let cancelled = false;
    const probe = () => {
      void fetch("/api/auth/session", { credentials: "include" })
        .then(async (res) => {
          const json = (await res.json().catch(() => null)) as { authenticated?: boolean } | null;
          if (!cancelled && res.ok && json?.authenticated === true) {
            setSessionApiAuthenticated(true);
          }
        })
        .catch(() => {
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
  }, [dependent, membership.status, pathname]);

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
   * Messenger room/call — middleware already requires auth. Same fail-open as owner shell:
   * never replace with Loading… once session cookie/API says authenticated.
   */
  if (
    isMessengerRoomOrCallPath(pathForOwnerGate) &&
    sessionApiAuthenticated &&
    !isAuthExitNavigateStarted()
  ) {
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
    return (
      <div
        className="flex min-h-[40vh] items-center justify-center bg-sam-app px-4"
        aria-busy="true"
        data-auth-session-boundary="blocked"
      >
        <p className="sam-text-body text-sam-muted">{t("mypage_comp_loading_ellipsis")}</p>
      </div>
    );
  }

  return <>{children}</>;
}
