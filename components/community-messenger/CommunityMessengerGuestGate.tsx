"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getMyProfile } from "@/lib/profile/getMyProfile";
import { profileRowToClientProfile } from "@/lib/auth/profile-row-to-client-profile";
import { setSupabaseProfileCache } from "@/lib/auth/supabase-profile-cache";
import { GuestLoginRequiredPanel } from "@/components/auth/GuestLoginRequiredPanel";

/**
 * 메신저 도메인 — 비회원은 목록 대신 로그인 안내(404 금지).
 * 직접 URL 진입 시 패널 CTA 로 AuthModal 을 연다(탭 클릭은 BottomNav 가 선처리).
 */
export function CommunityMessengerGuestGate({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [allowed, setAllowed] = useState<boolean | null>(() =>
    getCurrentUser()?.id ? true : null,
  );

  useEffect(() => {
    if (allowed !== null) return;
    let cancelled = false;
    void (async () => {
      const cached = getCurrentUser();
      if (cached?.id) {
        if (!cancelled) setAllowed(true);
        return;
      }
      const row = await getMyProfile().catch(() => null);
      if (cancelled) return;
      if (row?.id) {
        setSupabaseProfileCache(profileRowToClientProfile(row));
        setAllowed(true);
        return;
      }
      setAllowed(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [allowed]);

  if (allowed === null) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-4 py-16">
        <p className="sam-text-body text-sam-muted">{t("mypage_comp_loading_ellipsis")}</p>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="flex min-h-0 flex-1 flex-col px-4 py-8">
        <GuestLoginRequiredPanel actionType="messenger_open" />
      </div>
    );
  }

  return <>{children}</>;
}
