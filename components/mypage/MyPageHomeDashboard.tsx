"use client";

import { useEffect } from "react";
import { MypageProfileSummary } from "@/components/mypage/home/MypageProfileSummary";
import { MypageRequiredInfoSummary } from "@/components/mypage/home/MypageRequiredInfoSummary";
import { MypageSessionReloginCard } from "@/components/mypage/home/MypageSessionReloginCard";
import { MyPageAdminMenuEntry } from "@/components/mypage/MyPageAdminMenuEntry";
import {
  MyInfoAccountMenuSection,
  MyInfoServiceMenuSection,
  MyInfoStoreMenuSection,
  MyInfoSupportMenuSection,
} from "@/components/mypage/myinfo/MyInfoHomeMenuSections";
import { MYPAGE_HOME_BODY_CLASS } from "@/lib/ui/mypage-home-starbucks-styles";
import type { MypageHomeProjection } from "@/lib/mypage/mypage-home-store";
import { MYPAGE_ADDRESSES_HREF } from "@/lib/mypage/mypage-profile-routes";
import { useMypageProfileSheets } from "@/components/mypage/profile-settings/mypage-profile-sheets-context";

const COLUMN_STACK_CLASS = "flex min-w-0 flex-col gap-3 md:gap-4";

/** /mypage 메인 — 프로필 요약 + 필수 정보 + 정적 메뉴 (편집 form 미마운트) */
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
            <MypageRequiredInfoSummary projection={projection} />
          </>
        )}

        <div className="flex flex-col gap-3 md:hidden">
          <MyInfoStoreMenuSection />
          <MyInfoAccountMenuSection addressesMenuHref={MYPAGE_ADDRESSES_HREF} />
          <MyInfoServiceMenuSection />
          <MyInfoSupportMenuSection />
          <MyPageAdminMenuEntry starbucks />
        </div>

        <div className="hidden md:max-[1025px]:grid md:max-[1025px]:grid-cols-2 md:max-[1025px]:gap-4">
          <div className={COLUMN_STACK_CLASS}>
            <MyInfoSupportMenuSection />
            <MyInfoServiceMenuSection />
          </div>
          <div className={COLUMN_STACK_CLASS}>
            <MyInfoStoreMenuSection />
            <MyInfoAccountMenuSection addressesMenuHref={MYPAGE_ADDRESSES_HREF} />
          </div>
          <div className="md:max-[1025px]:col-span-2">
            <MyPageAdminMenuEntry starbucks />
          </div>
        </div>

        <div className="hidden min-[1025px]:grid min-[1025px]:grid-cols-3 min-[1025px]:gap-4">
          <div className={COLUMN_STACK_CLASS}>
            <MyInfoSupportMenuSection />
          </div>
          <div className={COLUMN_STACK_CLASS}>
            <MyInfoStoreMenuSection />
            <MyPageAdminMenuEntry starbucks />
          </div>
          <div className={COLUMN_STACK_CLASS}>
            <MyInfoAccountMenuSection addressesMenuHref={MYPAGE_ADDRESSES_HREF} />
            <MyInfoServiceMenuSection />
          </div>
        </div>
      </div>
    </div>
  );
}
