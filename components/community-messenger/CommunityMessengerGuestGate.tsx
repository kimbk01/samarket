"use client";

import type { ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { GuestLoginRequiredPanel } from "@/components/auth/GuestLoginRequiredPanel";
import { useClientMembershipState } from "@/hooks/use-client-membership-state";

/**
 * 메신저 도메인 — 비회원은 목록 대신 로그인 안내(404 금지).
 * 직접 URL 진입 시 패널 CTA 로 AuthModal 을 연다(탭 클릭은 BottomNav 가 선처리).
 */
export function CommunityMessengerGuestGate({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const membership = useClientMembershipState("community-messenger-guest-gate");

  if (membership.status === "checking") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-4 py-16">
        <p className="sam-text-body text-sam-muted">{t("mypage_comp_loading_ellipsis")}</p>
      </div>
    );
  }

  if (membership.status === "guest") {
    return (
      <div className="flex min-h-0 flex-1 flex-col px-4 py-8">
        <GuestLoginRequiredPanel actionType="messenger_open" />
      </div>
    );
  }

  return <>{children}</>;
}
