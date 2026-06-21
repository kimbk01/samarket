"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { LogoutConfirmModal } from "@/components/auth/LogoutConfirmModal";
import {
  navigateAfterAuthExitOnce,
  runAuthLogoutExit,
} from "@/lib/auth/auth-exit-coordinator";
import { MannerBatteryDisplay } from "@/components/trust/MannerBatteryDisplay";
import { MyPageAdminMenuEntry } from "@/components/mypage/MyPageAdminMenuEntry";
import { MyInfoProfileHubCard } from "@/components/mypage/myinfo/MyInfoProfileHubCard";
import { RequiredInfoList } from "@/components/mypage/myinfo/RequiredInfoList";
import {
  MyInfoAccountMenuSection,
  MyInfoServiceMenuSection,
  MyInfoStoreMenuSection,
  MyInfoSupportMenuSection,
} from "@/components/mypage/myinfo/MyInfoHomeMenuSections";
import { MypageProfileSheetsHost } from "@/components/mypage/profile-settings/MypageProfileSheetsHost";
import { MypageProfileSheetsProvider } from "@/components/mypage/profile-settings/mypage-profile-sheets-context";
import { MYPAGE_HOME_BODY_CLASS } from "@/lib/ui/mypage-home-starbucks-styles";
import type { AddressDefaultsSnapshot } from "@/lib/addresses/address-defaults-snapshot";
import type { MyPageOverviewCounts } from "@/components/mypage/types";
import type { ProfileCompletionState } from "@/lib/profile/profile-completion-state";
import type { ProfileRow } from "@/lib/profile/types";
import type { MyPageHomeDashboardCounts } from "@/lib/my/types";
import { useMypageHomeDashboardModel } from "@/hooks/use-mypage-home-dashboard-model";

const COLUMN_STACK_CLASS = "flex min-w-0 flex-col gap-3 md:gap-4";

function MyPageHomeDashboardBody({
  profile,
  mannerScore,
  overviewCounts,
  profileCompletion,
  homeDashboardCounts,
  addressDefaultsSnapshot,
  onProfileRefresh,
  onLogoutPress,
}: {
  profile: ProfileRow;
  mannerScore: number;
  overviewCounts: MyPageOverviewCounts;
  profileCompletion: ProfileCompletionState | null;
  homeDashboardCounts?: MyPageHomeDashboardCounts | null;
  addressDefaultsSnapshot?: AddressDefaultsSnapshot | null;
  onProfileRefresh?: () => void;
  onLogoutPress: () => void;
}) {
  const {
    miniProfile,
    completion,
    statRows,
    addressesMenuHref,
    openDibayIdSheet,
    openPhoneSheet,
    openAddress,
  } = useMypageHomeDashboardModel({
    profile,
    overviewCounts,
    homeDashboardCounts,
    addressDefaultsSnapshot,
    initialCompletion: profileCompletion,
    onProfileRefresh,
  });

  return (
    <>
      <MyInfoProfileHubCard
        avatarUrl={miniProfile.avatarUrl}
        displayName={miniProfile.displayName}
        atUsername={miniProfile.atUsername}
        publicProfileHref={miniProfile.publicProfileHref}
        onSettingsPress={miniProfile.onSettingsPress}
        onLogoutPress={onLogoutPress}
        mannerSlot={
          <MannerBatteryDisplay raw={mannerScore} size="sm" layout="inline" className="gap-1.5" />
        }
        statItems={statRows}
      />

      <RequiredInfoList
        completion={completion}
        onDibayIdPress={openDibayIdSheet}
        onPhonePress={openPhoneSheet}
        onAddressPress={openAddress}
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

      <MypageProfileSheetsHost profile={profile} />
    </>
  );
}

/** 내정보 홈 — 프로필 허브(상단) + 미완 필수정보만 + 메뉴 */
export function MyPageHomeDashboard({
  profile,
  mannerScore,
  overviewCounts,
  profileCompletion = null,
  homeDashboardCounts = null,
  addressDefaultsSnapshot = null,
  showBanner,
  bannerSlot,
  onProfileRefresh,
}: {
  profile: ProfileRow;
  mannerScore: number;
  overviewCounts: MyPageOverviewCounts;
  profileCompletion?: ProfileCompletionState | null;
  homeDashboardCounts?: MyPageHomeDashboardCounts | null;
  addressDefaultsSnapshot?: AddressDefaultsSnapshot | null;
  showBanner?: boolean;
  bannerSlot?: React.ReactNode;
  onProfileRefresh?: () => void;
}) {
  const { t } = useI18n();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [logoutSubmitting, setLogoutSubmitting] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  return (
    <MypageProfileSheetsProvider>
      <div className={MYPAGE_HOME_BODY_CLASS}>
        {showBanner && bannerSlot ? <div className="mb-3 shrink-0">{bannerSlot}</div> : null}
        <div className="flex min-h-0 min-w-0 flex-col gap-3 sm:gap-4">
          <MyPageHomeDashboardBody
            profile={profile}
            mannerScore={mannerScore}
            overviewCounts={overviewCounts}
            profileCompletion={profileCompletion}
            homeDashboardCounts={homeDashboardCounts}
            addressDefaultsSnapshot={addressDefaultsSnapshot}
            onProfileRefresh={onProfileRefresh}
            onLogoutPress={() => {
              setLogoutError(null);
              setLogoutOpen(true);
            }}
          />
        </div>
      </div>

      <LogoutConfirmModal
        open={logoutOpen}
        submitting={logoutSubmitting}
        error={logoutError}
        onCancel={() => {
          if (logoutSubmitting) return;
          setLogoutOpen(false);
        }}
        onConfirm={async () => {
          setLogoutSubmitting(true);
          setLogoutError(null);
          const safety = window.setTimeout(() => {
            setLogoutSubmitting(false);
            setLogoutOpen(false);
            navigateAfterAuthExitOnce("logout");
          }, 6_000);
          try {
            const result = await runAuthLogoutExit();
            window.clearTimeout(safety);
            setLogoutSubmitting(false);
            if (!result.ok) {
              setLogoutError(result.message ?? t("auth_logout_err_failed"));
              return;
            }
            setLogoutOpen(false);
          } catch (e) {
            window.clearTimeout(safety);
            setLogoutSubmitting(false);
            setLogoutError(e instanceof Error ? e.message : t("auth_logout_err_failed"));
          }
        }}
      />
    </MypageProfileSheetsProvider>
  );
}
