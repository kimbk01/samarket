"use client";

import { useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { MyPageData } from "@/lib/my/types";
import { MyPageHeader } from "@/components/my/MyPageHeader";
import { MyTopBanner } from "@/components/my/MyTopBanner";
import { MyPageHomeDashboard } from "@/components/mypage/MyPageHomeDashboard";
import { useMypageHubModel } from "@/hooks/use-mypage-hub-model";
import { useMyNotificationUnreadCount } from "@/hooks/useMyNotificationUnreadCount";
import { MYPAGE_MOBILE_NAV_QUERY, normalizeMyPageTab } from "@/components/mypage/mypage-nav";
import { mapLegacyMyPageItemSlug } from "@/lib/mypage/mypage-mobile-nav-registry";
import { APP_MAIN_COLUMN_CLASS } from "@/lib/ui/app-content-layout";
import {
  MYPAGE_INFO_HUB_SHEET_PARAM,
  MYPAGE_INFO_HUB_SHEET_VALUE,
  MYPAGE_MAIN_HREF,
} from "@/lib/my/mypage-info-hub";

export function MyContent({ initialMyPageData }: { initialMyPageData?: MyPageData | null } = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const infoHubOpen =
    searchParams.get(MYPAGE_INFO_HUB_SHEET_PARAM) === MYPAGE_INFO_HUB_SHEET_VALUE;

  const { data, loading, load, overviewCounts } = useMypageHubModel(initialMyPageData ?? undefined);
  const notificationUnreadCount = useMyNotificationUnreadCount();

  useEffect(() => {
    if (!infoHubOpen) return;
    router.replace(MYPAGE_MAIN_HREF);
  }, [infoHubOpen, router]);

  /** 레거시 `?tab=&section=` → 계층형 경로 */
  useEffect(() => {
    const tab = searchParams.get("tab");
    const nav = searchParams.get(MYPAGE_MOBILE_NAV_QUERY);
    if (nav === "1") {
      router.replace("/mypage");
      return;
    }
    if (!tab) return;
    const rawSection = searchParams.get("section");
    if (tab === "account" && (!rawSection || rawSection === "home")) {
      router.replace("/mypage");
      return;
    }
    if (!rawSection || rawSection === "home") {
      router.replace(`/mypage/section/${encodeURIComponent(tab)}`);
      return;
    }
    const normalizedTab = normalizeMyPageTab(tab);
    const item = mapLegacyMyPageItemSlug(normalizedTab, rawSection);
    router.replace(`/mypage/section/${encodeURIComponent(normalizedTab)}/${encodeURIComponent(item)}`);
  }, [router, searchParams]);

  const loadBanner = useCallback(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <MyPageHeader notificationUnreadCount={notificationUnreadCount} backFallbackHref="/home" />
        <div className={`${APP_MAIN_COLUMN_CLASS} space-y-4 px-4 pt-4 pb-8`}>
          <div className="rounded-2xl border border-ig-border bg-[var(--sub-bg)] px-4 py-10 text-center text-[14px] text-[var(--text-muted)]">
            내정보를 불러오는 중이에요.
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-background">
        <MyPageHeader notificationUnreadCount={notificationUnreadCount} backFallbackHref="/home" />
        <div className={`${APP_MAIN_COLUMN_CLASS} space-y-4 px-4 pt-4 pb-8`}>
          <div className="rounded-2xl border border-ig-border bg-[var(--sub-bg)] px-4 py-10 text-center text-[14px] text-[var(--text-muted)]">
            로그인이 필요합니다.
          </div>
        </div>
      </div>
    );
  }

  const { profile, banner, bannerHidden, mannerScore } = data;
  const showBanner = banner && !bannerHidden;

  return (
    <div className="flex min-h-screen flex-col bg-background pb-8">
      <MyPageHeader
        notificationUnreadCount={notificationUnreadCount}
        centerTitle="내정보"
        centerSubtitle={null}
        backFallbackHref="/home"
      />
      <div className="mx-auto flex min-h-0 w-full min-w-0 flex-1 flex-col">
        {profile ? (
          <MyPageHomeDashboard
            profile={profile}
            mannerScore={mannerScore}
            overviewCounts={overviewCounts}
            showBanner={Boolean(showBanner)}
            bannerSlot={
              showBanner ? <MyTopBanner banner={banner} onDismiss={loadBanner} /> : null
            }
          />
        ) : (
          <div className="mx-4 mt-4 rounded-2xl border border-ig-border bg-[var(--sub-bg)] px-4 py-10 text-center text-[14px] text-[var(--text-muted)] sm:mx-0">
            프로필을 불러오지 못했어요. 다시 로그인해 주세요.
          </div>
        )}
      </div>
    </div>
  );
}
