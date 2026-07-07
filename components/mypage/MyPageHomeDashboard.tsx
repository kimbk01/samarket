"use client";

import { useEffect } from "react";
import { MyInfoProfileSection } from "@/components/mypage/myinfo/MyInfoProfileSection";
import { RequiredInfoList } from "@/components/mypage/myinfo/RequiredInfoList";
import { MyPageAdminMenuEntry } from "@/components/mypage/MyPageAdminMenuEntry";
import {
  MyInfoAccountMenuSection,
  MyInfoServiceMenuSection,
  MyInfoStoreMenuSection,
  MyInfoSupportMenuSection,
} from "@/components/mypage/myinfo/MyInfoHomeMenuSections";
import { MYPAGE_HOME_BODY_CLASS } from "@/lib/ui/mypage-home-starbucks-styles";
import type { ProfileCompletionState } from "@/lib/profile/profile-completion-state";
import type { ProfileRow } from "@/lib/profile/types";
import { useMypageHomeDashboardModel } from "@/hooks/use-mypage-home-dashboard-model";
import { useMypageProfileSheets } from "@/components/mypage/profile-settings/mypage-profile-sheets-context";

const COLUMN_STACK_CLASS = "flex min-w-0 flex-col gap-3 md:gap-4";

/** /mypage 메인 — 프로필(보기·수정) + 필수 정보 + lazy 메뉴 */
export function MyPageHomeDashboard({
  profile,
  profileCompletion = null,
  onProfileRefresh,
}: {
  profile: ProfileRow;
  profileCompletion?: ProfileCompletionState | null;
  onProfileRefresh?: () => void;
}) {
  const { completion, addressesMenuHref } = useMypageHomeDashboardModel({
    profile,
    initialCompletion: profileCompletion,
    onProfileRefresh,
  });
  const { setOnProfileUpdated } = useMypageProfileSheets();

  useEffect(() => {
    if (!onProfileRefresh) return;
    setOnProfileUpdated(onProfileRefresh);
  }, [onProfileRefresh, setOnProfileUpdated]);

  return (
    <div className={MYPAGE_HOME_BODY_CLASS}>
      <div className="flex min-h-0 min-w-0 flex-col gap-3 sm:gap-4">
        <MyInfoProfileSection profile={profile} onProfileRefresh={onProfileRefresh} />
        <RequiredInfoList
          profile={profile}
          completion={completion}
          onProfileRefresh={onProfileRefresh}
        />

        <div className="flex flex-col gap-3 md:hidden">
          <MyInfoStoreMenuSection />
          <MyInfoAccountMenuSection addressesMenuHref={addressesMenuHref} />
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
            <MyInfoAccountMenuSection addressesMenuHref={addressesMenuHref} />
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
            <MyInfoAccountMenuSection addressesMenuHref={addressesMenuHref} />
            <MyInfoServiceMenuSection />
          </div>
        </div>
      </div>
    </div>
  );
}
