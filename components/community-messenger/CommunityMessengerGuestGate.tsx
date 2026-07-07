"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { GuestLoginRequiredPanel } from "@/components/auth/GuestLoginRequiredPanel";
import { useClientMembershipState } from "@/hooks/use-client-membership-state";
import { evaluateClientProfileRequirements } from "@/lib/profile/require-profile-completion.client";
import { openProfileCompletionRequiredModal } from "@/lib/profile/profile-completion-modal-client";
import { samarketRuntimeDebugEnabled } from "@/lib/runtime/samarket-runtime-debug";

function isCommunityMessengerRoomEntryPath(pathname: string | null): boolean {
  return /\/community-messenger\/rooms\/[^/]+/.test(String(pathname ?? ""));
}

/**
 * 메신저 도메인 — 비회원은 목록 대신 로그인 안내(404 금지).
 * 직접 URL 진입 시 패널 CTA 로 AuthModal 을 연다(탭 클릭은 BottomNav 가 선처리).
 */
export function CommunityMessengerGuestGate({ children }: { children: ReactNode }) {
  const { t, safeT } = useI18n();
  const pathname = usePathname();
  const membership = useClientMembershipState("community-messenger-guest-gate");
  const roomEntryPath = isCommunityMessengerRoomEntryPath(pathname);
  const [profileGate, setProfileGate] = useState<"pending" | "allowed" | "blocked">("pending");

  useEffect(() => {
    if (membership.status !== "member") {
      setProfileGate("allowed");
      return;
    }
    let alive = true;
    void evaluateClientProfileRequirements(membership.profile, "messenger_open").then((evaluation) => {
      if (!alive) return;
      if (evaluation.satisfied) {
        setProfileGate("allowed");
        return;
      }
      const next =
        typeof window !== "undefined"
          ? `${window.location.pathname}${window.location.search}`
          : undefined;
      openProfileCompletionRequiredModal({
        actionType: "messenger_open",
        missingFields: evaluation.missingFields,
        next,
      });
      setProfileGate("blocked");
    });
    return () => {
      alive = false;
    };
  }, [membership]);

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

  if (membership.status === "member" && profileGate === "pending") {
    return (
      <>
        {guestGateDebugProbe}
        <div className="flex min-h-[40vh] items-center justify-center px-4 py-16">
          <p className="sam-text-body text-sam-muted">{t("mypage_comp_loading_ellipsis")}</p>
        </div>
      </>
    );
  }

  if (membership.status === "member" && profileGate === "blocked") {
    return (
      <>
        {guestGateDebugProbe}
        <div className="flex min-h-[40vh] items-center justify-center px-4 py-16">
          <p className="sam-text-body text-center text-sam-muted">
            {safeT("profile_completion_body_messenger", {
              fallbackKo: "메신저를 이용하려면 프로필 정보를 먼저 완성해 주세요.",
              fallbackEn: "Complete your profile before using Messenger.",
            })}
          </p>
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
