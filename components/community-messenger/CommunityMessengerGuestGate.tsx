"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { GuestLoginRequiredPanel } from "@/components/auth/GuestLoginRequiredPanel";
import { MessengerBootstrapEarlyWarm } from "@/components/community-messenger/MessengerBootstrapEarlyWarm";
import { useClientMembershipState } from "@/hooks/use-client-membership-state";
import { profileToDibaySignupInput } from "@/lib/auth/client-signup-gate";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { requireAuthAction } from "@/lib/auth/require-auth-action";
import { evaluateProfileRequirements } from "@/lib/profile/require-profile-completion";
import { samarketRuntimeDebugEnabled } from "@/lib/runtime/samarket-runtime-debug";

function isCommunityMessengerRoomEntryPath(pathname: string | null): boolean {
  return /\/community-messenger\/rooms\/[^/]+/.test(String(pathname ?? ""));
}

function isMessengerProfileSatisfied(): boolean {
  const profile = getCurrentUser();
  if (!profile?.id) return false;
  const signupInput = profileToDibaySignupInput(profile);
  return evaluateProfileRequirements(
    {
      ...signupInput,
      nickname: profile.nickname ?? signupInput.display_name,
      phone_verified: profile.phone_verified,
      phone_verified_at: profile.phone_verified_at ?? null,
    },
    "messenger_open"
  ).satisfied;
}

type MessengerAccessState = "pending" | "allowed" | "blocked";

/**
 * 메신저 도메인 — 비회원은 목록 대신 로그인 안내(404 금지).
 * 회원이어도 `messenger_open` 프로필 미완성이면 children·bootstrap 을 막는다.
 */
export function CommunityMessengerGuestGate({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const membership = useClientMembershipState("community-messenger-guest-gate");
  const roomEntryPath = isCommunityMessengerRoomEntryPath(pathname);
  const [messengerAccess, setMessengerAccess] = useState<MessengerAccessState>("pending");
  const gateRunRef = useRef(0);

  useEffect(() => {
    if (membership.status !== "member") {
      setMessengerAccess("pending");
      return;
    }

    if (isMessengerProfileSatisfied()) {
      setMessengerAccess("allowed");
      return;
    }

    const runId = ++gateRunRef.current;
    setMessengerAccess("blocked");
    void requireAuthAction(
      "messenger_open",
      () => {
        if (gateRunRef.current === runId) setMessengerAccess("allowed");
      },
      { next: `${pathname ?? "/community-messenger"}` }
    ).then((ok) => {
      if (gateRunRef.current !== runId) return;
      if (ok) setMessengerAccess("allowed");
    });
  }, [membership.status, pathname]);

  const guestGateDebugProbe =
    samarketRuntimeDebugEnabled() ? (
      <span
        data-cm-guest-gate-debug=""
        data-cm-guest-gate-status={membership.status}
        data-cm-guest-gate-room-entry={roomEntryPath ? "1" : "0"}
        data-cm-messenger-access={messengerAccess}
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

  if (messengerAccess === "pending") {
    if (roomEntryPath) {
      return <>{guestGateDebugProbe}</>;
    }
    return (
      <>
        {guestGateDebugProbe}
        <div className="flex min-h-[40vh] items-center justify-center px-4 py-16" data-cm-profile-gate-spinner="">
          <p className="sam-text-body text-sam-muted">{t("mypage_comp_loading_ellipsis")}</p>
        </div>
      </>
    );
  }

  if (messengerAccess === "blocked") {
    return <>{guestGateDebugProbe}</>;
  }

  return (
    <>
      {guestGateDebugProbe}
      <MessengerBootstrapEarlyWarm />
      {children}
    </>
  );
}
