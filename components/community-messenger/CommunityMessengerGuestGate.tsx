"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { GuestLoginRequiredPanel } from "@/components/auth/GuestLoginRequiredPanel";
import { useClientMembershipState } from "@/hooks/use-client-membership-state";
import { samarketRuntimeDebugEnabled } from "@/lib/runtime/samarket-runtime-debug";

function isCommunityMessengerRoomEntryPath(pathname: string | null): boolean {
  return /\/community-messenger\/rooms\/[^/]+/.test(String(pathname ?? ""));
}

/**
 * 메신저 도메인 — 비회원은 목록 대신 로그인 안내.
 * 회원 열람은 인증 popup 없음. 전화/주소는 전송·통화 등 ACTION 에서만 gate.
 */
export function CommunityMessengerGuestGate({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const membership = useClientMembershipState("community-messenger-guest-gate");
  const roomEntryPath = isCommunityMessengerRoomEntryPath(pathname);

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

  if (membership.status === "checking" && !roomEntryPath) {
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
