"use client";

import { useEffect } from "react";
import { MypageProfileSummary } from "@/components/mypage/home/MypageProfileSummary";
import { MypagePointsAssetSummary } from "@/components/mypage/home/MypagePointsAssetSummary";
import { MypageRequiredInfoSummary } from "@/components/mypage/home/MypageRequiredInfoSummary";
import { MypageSessionReloginCard } from "@/components/mypage/home/MypageSessionReloginCard";
import { MyPageAdminMenuEntry } from "@/components/mypage/MyPageAdminMenuEntry";
import {
  MyInfoAccountMenuSection,
  MyInfoServiceMenuSection,
  MyInfoStoreMenuSection,
  MyInfoSupportMenuSection,
  MyInfoTradeMenuSection,
} from "@/components/mypage/myinfo/MyInfoHomeMenuSections";
import { MYPAGE_HOME_BODY_CLASS } from "@/lib/ui/mypage-home-starbucks-styles";
import {
  MYPAGE_HOME_MENU_DESKTOP_CLASS,
  MYPAGE_HOME_MENU_MOBILE_CLASS,
  MYPAGE_HOME_MENU_TABLET_ADMIN_SPAN_CLASS,
  MYPAGE_HOME_MENU_TABLET_CLASS,
} from "@/lib/ui/mypage-responsive-breakpoints";
import type { MypageHomeProjection } from "@/lib/mypage/mypage-home-store";
import { MYPAGE_ADDRESSES_HREF } from "@/lib/mypage/mypage-profile-routes";
import { useMypageProfileSheets } from "@/components/mypage/profile-settings/mypage-profile-sheets-context";
import { useMypageHubScrollRestore } from "@/lib/mypage/use-mypage-hub-scroll-restore";

const COLUMN_STACK_CLASS = "flex min-w-0 flex-col gap-3 md:gap-4";

/**
 * Slice 3 IA order (mobile):
 * Profile(+manner) → assets → required → trade → store → account(+logout) → service → support
 * Slice 9 Phase 1: breakpoint classes from mypage-responsive-breakpoints SSOT (767 / 1025).
 */
export function MyPageHomeDashboard({
  projection,
  onProfileRefresh,
  needsRelogin = false,
}: {
  projection: MypageHomeProjection | null;
  onProfileRefresh?: () => void;
  /** Local session present but profile resolve failed — show re-login, not endless checking. */
  needsRelogin?: boolean;
}) {
  const { setOnProfileUpdated } = useMypageProfileSheets();
  useMypageHubScrollRestore(true);

  useEffect(() => {
    if (!onProfileRefresh) return;
    setOnProfileUpdated(onProfileRefresh);
  }, [onProfileRefresh, setOnProfileUpdated]);

  return (
    <div className={MYPAGE_HOME_BODY_CLASS}>
      <div className="flex min-h-0 min-w-0 flex-col gap-3 sm:gap-4">
        {needsRelogin ? (
          <MypageSessionReloginCard />
        ) : (
          <>
            <MypageProfileSummary projection={projection} />
            <MypagePointsAssetSummary />
            <MypageRequiredInfoSummary projection={projection} />
          </>
        )}

        <div className={MYPAGE_HOME_MENU_MOBILE_CLASS}>
          <MyInfoTradeMenuSection />
          <MyInfoStoreMenuSection />
          <MyInfoAccountMenuSection addressesMenuHref={MYPAGE_ADDRESSES_HREF} />
          <MyInfoServiceMenuSection />
          <MyInfoSupportMenuSection />
          <MyPageAdminMenuEntry starbucks />
        </div>

        <div className={MYPAGE_HOME_MENU_TABLET_CLASS}>
          <div className={COLUMN_STACK_CLASS}>
            <MyInfoTradeMenuSection />
            <MyInfoStoreMenuSection />
          </div>
          <div className={COLUMN_STACK_CLASS}>
            <MyInfoAccountMenuSection addressesMenuHref={MYPAGE_ADDRESSES_HREF} />
            <MyInfoServiceMenuSection />
            <MyInfoSupportMenuSection />
          </div>
          <div className={MYPAGE_HOME_MENU_TABLET_ADMIN_SPAN_CLASS}>
            <MyPageAdminMenuEntry starbucks />
          </div>
        </div>

        <div className={MYPAGE_HOME_MENU_DESKTOP_CLASS}>
          <div className={COLUMN_STACK_CLASS}>
            <MyInfoTradeMenuSection />
            <MyInfoStoreMenuSection />
          </div>
          <div className={COLUMN_STACK_CLASS}>
            <MyInfoAccountMenuSection addressesMenuHref={MYPAGE_ADDRESSES_HREF} />
            <MyPageAdminMenuEntry starbucks />
          </div>
          <div className={COLUMN_STACK_CLASS}>
            <MyInfoServiceMenuSection />
            <MyInfoSupportMenuSection />
          </div>
        </div>
      </div>
    </div>
  );
}
