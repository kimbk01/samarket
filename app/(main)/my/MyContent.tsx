"use client";

import { useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { MyPageData } from "@/lib/my/types";
import { MyPageHeader } from "@/components/my/MyPageHeader";
import { MyTopBanner } from "@/components/my/MyTopBanner";
import { MyPageHomeDashboard } from "@/components/mypage/MyPageHomeDashboard";
import { useMypageHubModel } from "@/hooks/use-mypage-hub-model";
import { MYPAGE_MOBILE_NAV_QUERY, normalizeMyPageTab } from "@/components/mypage/mypage-nav";
import { mapLegacyMyPageItemSlug } from "@/lib/mypage/mypage-mobile-nav-registry";
import { APP_MAIN_COLUMN_CLASS, APP_MAIN_TAB_SCROLL_BODY_CLASS } from "@/lib/ui/app-content-layout";
import {
  PHILIFE_FB_CARD_CLASS,
  PHILIFE_FEED_INSET_X_CLASS,
} from "@/lib/philife/philife-flat-ui-classes";
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
      <div className="flex min-h-screen min-w-0 flex-col bg-sam-app">
        <MyPageHeader backFallbackHref="/home" />
        <div className={APP_MAIN_TAB_SCROLL_BODY_CLASS}>
          <div className={`${PHILIFE_FB_CARD_CLASS} sam-card__body py-10 text-center sam-text-body-secondary`}>
            내정보를 불러오는 중이에요.
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen min-w-0 flex-col bg-sam-app">
        <MyPageHeader backFallbackHref="/home" />
        <div className={APP_MAIN_TAB_SCROLL_BODY_CLASS}>
          <div className={`${PHILIFE_FB_CARD_CLASS} sam-card__body py-10 text-center sam-text-body-secondary`}>
            로그인이 필요합니다.
          </div>
        </div>
      </div>
    );
  }

  const { profile, banner, bannerHidden, mannerScore } = data;
  const showBanner = banner && !bannerHidden;

  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-sam-app">
      <MyPageHeader centerTitle="내정보" centerSubtitle={null} backFallbackHref="/home" />
      <div
        className={`${APP_MAIN_COLUMN_CLASS} flex min-h-0 min-w-0 flex-1 flex-col`}
      >
        {profile ? (
          <MyPageHomeDashboard
            profile={profile}
            mannerScore={mannerScore}
            overviewCounts={overviewCounts}
            homeDashboardCounts={data.homeDashboardCounts ?? null}
            showBanner={Boolean(showBanner)}
            bannerSlot={
              showBanner ? <MyTopBanner banner={banner} onDismiss={loadBanner} /> : null
            }
          />
        ) : (
          <div className={`${PHILIFE_FEED_INSET_X_CLASS} pt-1`}>
            <div className={`${PHILIFE_FB_CARD_CLASS} sam-card__body py-10 text-center sam-text-body-secondary`}>
              프로필을 불러오지 못했어요. 다시 로그인해 주세요.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
