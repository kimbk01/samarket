"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { isAccountDependentPath } from "@/lib/auth/auth-route-classification";
import {
  isAuthExitNavigateStarted,
  runAuthAccountSwitchExit,
  runAuthSessionExpiredExit,
} from "@/lib/auth/auth-exit-coordinator";
import { exposeResetAuthStateForDev } from "@/lib/auth/reset-auth-state";
import { useClientMembershipState } from "@/hooks/use-client-membership-state";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

type Props = {
  children: ReactNode;
};

/**
 * account-dependent 경로 — membership resolve 완료 전까지 private UI 렌더 금지.
 * 캐시 비어 있어도 세션 API 로 회원 여부를 확인한 뒤에만 redirect 한다.
 */
export function AuthSessionBoundary({ children }: Props) {
  const { t } = useI18n();
  const pathname = usePathname() ?? "";
  const membership = useClientMembershipState("auth-session-boundary");
  const lastUserIdRef = useRef<string | null>(null);
  const dependent = isAccountDependentPath(pathname);

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

    if (membership.status === "guest") {
      void runAuthSessionExpiredExit();
      return;
    }

    const userId = membership.profile.id.trim();
    if (lastUserIdRef.current && lastUserIdRef.current !== userId) {
      void runAuthAccountSwitchExit();
    }
    lastUserIdRef.current = userId;
  }, [dependent, membership]);

  if (!dependent) {
    return <>{children}</>;
  }

  if (membership.status === "checking" || membership.status === "guest" || isAuthExitNavigateStarted()) {
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
