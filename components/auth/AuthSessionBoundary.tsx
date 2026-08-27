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
import { exposeResetAuthStateForDev } from "@/lib/auth/reset-auth-state";
import { getSessionPhase } from "@/lib/auth/dibay-session-manager";
import { isRecoveringPhase } from "@/lib/auth/dibay-session-policy";
import { useClientMembershipState } from "@/hooks/use-client-membership-state";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

type Props = {
  children: ReactNode;
};

/**
 * account-dependent 경로 — membership resolve 완료 전까지 private UI 렌더 금지.
 * guest 는 auth_required, corrupt 만 session_expired.
 * recovering/loading ≠ guest — login exit 금지.
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
      void runAuthRequiredExit();
      return;
    }

    const userId = membership.profile.id.trim();
    if (lastUserIdRef.current && lastUserIdRef.current !== userId) {
      void runAuthAccountSwitchExit();
    }
    lastUserIdRef.current = userId;
  }, [dependent, membership]);

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
      // Registry/cookie race: session API may 401 while Supabase cookie session is still valid.
      void import("@/lib/supabase/client")
        .then(({ getSupabaseClient }) => getSupabaseClient()?.auth.getSession())
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

  const holdForRecovery =
    membership.status === "checking" ||
    isRecoveringPhase(phase) ||
    (membership.status === "guest" && phase !== "terminal_guest" && phase !== "corrupt");

  /** Session cookie already valid — do not pin messenger/private trees on Loading… during membership race. */
  const failOpenAuthenticatedWhileResolving =
    sessionApiAuthenticated &&
    (membership.status === "checking" ||
      (membership.status === "guest" && isRecoveringPhase(phase)));

  const blockPrivateTree =
    !failOpenAuthenticatedWhileResolving &&
    (holdForRecovery || membership.status === "guest" || isAuthExitNavigateStarted());

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
