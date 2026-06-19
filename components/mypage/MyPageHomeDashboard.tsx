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
import { MyInfoProfileCard } from "@/components/mypage/myinfo/MyInfoProfileCard";
import { MyInfoStatGrid } from "@/components/mypage/myinfo/MyInfoStatGrid";
import { MyInfoQuickAccessSection } from "@/components/mypage/myinfo/MyInfoQuickAccessSection";
import {
  MyInfoAccountMenuSection,
  MyInfoServiceMenuSection,
  MyInfoStoreMenuSection,
  MyInfoSupportMenuSection,
} from "@/components/mypage/myinfo/MyInfoHomeMenuSections";
import { MYPAGE_HOME_BODY_CLASS } from "@/lib/ui/mypage-home-starbucks-styles";
import type { AddressDefaultsSnapshot } from "@/lib/addresses/address-defaults-snapshot";
import type { MyPageOverviewCounts } from "@/components/mypage/types";
import type { ProfileRow } from "@/lib/profile/types";
import type { MyPageHomeDashboardCounts } from "@/lib/my/types";
import { useMypageHomeDashboardModel } from "@/hooks/use-mypage-home-dashboard-model";

const COLUMN_STACK_CLASS = "flex min-w-0 flex-col gap-3 md:gap-4";

/** 내정보 홈 — 조립 전용 (데이터·링크·카운트는 hook + config) */
export function MyPageHomeDashboard({
  profile,
  mannerScore,
  overviewCounts,
  showBanner,
  bannerSlot,
  homeDashboardCounts = null,
  addressDefaultsSnapshot = null,
}: {
  profile: ProfileRow;
  mannerScore: number;
  overviewCounts: MyPageOverviewCounts;
  showBanner?: boolean;
  bannerSlot?: React.ReactNode;
  homeDashboardCounts?: MyPageHomeDashboardCounts | null;
  addressDefaultsSnapshot?: AddressDefaultsSnapshot | null;
}) {
  const { t } = useI18n();
  const { profileCard, statRows, addressesMenuHref } = useMypageHomeDashboardModel({
    profile,
    overviewCounts,
    homeDashboardCounts,
    addressDefaultsSnapshot,
  });

  const [logoutOpen, setLogoutOpen] = useState(false);
  const [logoutSubmitting, setLogoutSubmitting] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  return (
    <div className={MYPAGE_HOME_BODY_CLASS}>
      {showBanner && bannerSlot ? <div className="mb-3 shrink-0">{bannerSlot}</div> : null}

      <div className="flex min-h-0 min-w-0 flex-col gap-3 sm:gap-4">
        <MyInfoProfileCard
          {...profileCard}
          onLogoutPress={() => {
            setLogoutError(null);
            setLogoutOpen(true);
          }}
          rightMetaSlot={
            <MannerBatteryDisplay raw={mannerScore} size="sm" layout="inline" className="gap-1.5" />
          }
        />

        <MyInfoStatGrid items={statRows} />

        <div className="flex flex-col gap-3 md:hidden">
          <MyInfoQuickAccessSection variant="icons" />
          <MyInfoStoreMenuSection />
          <MyInfoAccountMenuSection addressesMenuHref={addressesMenuHref} />
          <MyInfoServiceMenuSection />
          <MyInfoSupportMenuSection />
          <MyPageAdminMenuEntry starbucks />
        </div>

        <div className="hidden md:max-[1025px]:grid md:max-[1025px]:grid-cols-2 md:max-[1025px]:gap-4">
          <div className={COLUMN_STACK_CLASS}>
            <MyInfoQuickAccessSection variant="list" />
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
            <MyInfoQuickAccessSection variant="list" />
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
    </div>
  );
}
