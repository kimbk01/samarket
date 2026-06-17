"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { GuestLoginRequiredPanel } from "@/components/auth/GuestLoginRequiredPanel";
import { useClientMembershipState } from "@/hooks/use-client-membership-state";
import {
  MainTabSlowLoadPanel,
  useMainTabLoadTimeout,
} from "@/hooks/use-main-tab-load-timeout";
import { isOptimisticMemberViewer } from "@/lib/auth/client-membership-viewer";
import { samarketRuntimeDebugEnabled } from "@/lib/runtime/samarket-runtime-debug";

function isCommunityMessengerRoomEntryPath(pathname: string | null): boolean {
  return /\/community-messenger\/rooms\/[^/]+/.test(String(pathname ?? ""));
}

/**
 * 메신저 도메인 — 비회원은 목록 대신 로그인 안내(404 금지).
 * 직접 URL 진입 시 패널 CTA 로 AuthModal 을 연다(탭 클릭은 BottomNav 가 선처리).
 */
export function CommunityMessengerGuestGate({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const membership = useClientMembershipState("community-messenger-guest-gate");
  const roomEntryPath = isCommunityMessengerRoomEntryPath(pathname);
  const checking =
    membership.status === "checking" && !roomEntryPath && !isOptimisticMemberViewer();
  const { slow: checkingSlow, retry: retryMembership } = useMainTabLoadTimeout({
    active: checking,
    onRetry: () => window.location.reload(),
  });

  const guestGateDebugProbe =
    samarketRuntimeDebugEnabled() ? (
      <span
        data-cm-guest-gate-debug=""
        data-cm-guest-gate-status={membership.status}
        data-cm-guest-gate-room-entry={roomEntryPath ? "1" : "0"}
        aria-hidden
        className="hidden"
      />
    ) : null;

  /** BN14-2 — direct room cold: checking 스피너가 `[roomId]/layout` server inline shell 을 가리지 않게 한다. */
  if (membership.status === "checking" && !roomEntryPath && !isOptimisticMemberViewer()) {
    if (checkingSlow) {
      return (
        <>
          {guestGateDebugProbe}
          <MainTabSlowLoadPanel onRetry={retryMembership} />
        </>
      );
    }
    return (
      <>
        {guestGateDebugProbe}
        <div className="flex min-h-[40vh] items-center justify-center px-4 py-16" data-cm-guest-gate-spinner="">
          <p className="sam-text-body text-sam-muted">{t("mypage_comp_loading_ellipsis")}</p>
        </div>
      </>
    );
  }

  if (membership.status === "guest") {
    return (
      <>
        {guestGateDebugProbe}
        <div className="flex min-h-0 flex-1 flex-col px-4 py-8">
          <GuestLoginRequiredPanel actionType="messenger_open" />
        </div>
      </>
    );
  }

  return (
    <>
      {guestGateDebugProbe}
      {children}
    </>
  );
}
