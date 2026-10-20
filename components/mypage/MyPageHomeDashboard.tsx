"use client";

import { useEffect } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MypageProfileSummary } from "@/components/mypage/home/MypageProfileSummary";
import { MypagePointsAssetSummary } from "@/components/mypage/home/MypagePointsAssetSummary";
import { MypageRequiredInfoSummary } from "@/components/mypage/home/MypageRequiredInfoSummary";
import { MypageSessionReloginCard } from "@/components/mypage/home/MypageSessionReloginCard";
import { MyPageAdminMenuEntry } from "@/components/mypage/MyPageAdminMenuEntry";
import {
  MyInfoAccountMenuSection,
  MyInfoCommunityMenuSection,
  MyInfoDangerMenuSection,
  MyInfoPolicyMenuSection,
  MyInfoServiceMenuSection,
  MyInfoStoreMenuSection,
  MyInfoSupportMenuSection,
  MyInfoTradeMenuSection,
} from "@/components/mypage/myinfo/MyInfoHomeMenuSections";
import { MYPAGE_HOME_BODY_CLASS, MYPAGE_HOME_CARD_CLASS } from "@/lib/ui/mypage-home-starbucks-styles";
import { MYPAGE_HOME_MENU_FLOW_CLASS } from "@/lib/ui/mypage-responsive-breakpoints";
import type { MypageHomeProjection } from "@/lib/mypage/mypage-home-store";
import { MYPAGE_ADDRESSES_HREF } from "@/lib/mypage/mypage-profile-routes";
import { useMypageProfileSheets } from "@/components/mypage/profile-settings/mypage-profile-sheets-context";
import { useMypageHubScrollRestore } from "@/lib/mypage/use-mypage-hub-scroll-restore";
import type { MypageOwnerStoreGateSeed } from "@/lib/my/load-mypage-owner-store-gate-seed";
import type { MypageAdminMenuSeed } from "@/lib/my/load-mypage-admin-menu-seed";
import { MypageHomeCmsBanner } from "@/components/mypage/home/MypageHomeCmsBanner";

/**
 * Legacy IA — single behavior-flow column (all viewports).
 * identity → activity → store → assets → account → service → support → policy → danger
 * DO NOT reintroduce multi-column (2/3) menu catalogs.
 */
export function MyPageHomeDashboard({
  projection,
  onProfileRefresh,
  needsRelogin = false,
  loadFailed = false,
  ownerStoreGateSeed = null,
  adminMenuSeed = null,
}: {
  projection: MypageHomeProjection | null;
  onProfileRefresh?: () => void;
  /** Local session present but profile resolve failed — show re-login, not endless checking. */
  needsRelogin?: boolean;
  /** 5xx·네트워크 등 일시 실패 — projection 없으면 오류 카드 + 재시도 */
  loadFailed?: boolean;
  ownerStoreGateSeed?: MypageOwnerStoreGateSeed | null;
  adminMenuSeed?: MypageAdminMenuSeed | null;
}) {
  const { t } = useI18n();
  const { setOnProfileUpdated } = useMypageProfileSheets();
  useMypageHubScrollRestore(true);

  useEffect(() => {
    if (!onProfileRefresh) return;
    setOnProfileUpdated(onProfileRefresh);
  }, [onProfileRefresh, setOnProfileUpdated]);

  return (
    <div className={MYPAGE_HOME_BODY_CLASS} data-mypage-ia="legacy-flow">
      <div className={MYPAGE_HOME_MENU_FLOW_CLASS}>
        {needsRelogin ? (
          <MypageSessionReloginCard />
        ) : loadFailed && !projection ? (
          <div
            className={`${MYPAGE_HOME_CARD_CLASS} w-full self-start px-4 py-4`}
            data-testid="mypage-home-load-failed"
            role="alert"
          >
            <p className="text-[15px] font-semibold text-sam-fg">{t("mypage_home_load_failed")}</p>
            {onProfileRefresh ? (
              <button
                type="button"
                className="sam-btn sam-btn--secondary sam-btn--sm mt-3"
                onClick={onProfileRefresh}
              >
                {t("common_retry")}
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <MypageProfileSummary projection={projection} />
            <MypageRequiredInfoSummary
              projection={projection}
              onProfileRefresh={onProfileRefresh}
              loadFailed={loadFailed}
            />
            <MypageHomeCmsBanner />
          </>
        )}

        <MyInfoTradeMenuSection />
        <MyInfoCommunityMenuSection />
        <MyInfoStoreMenuSection
          ownerStoreGate={ownerStoreGateSeed?.ownerStoreGate}
          ownerStoreGateFirstId={ownerStoreGateSeed?.ownerStoreGateFirstId}
        />
        {!needsRelogin ? <MypagePointsAssetSummary /> : null}
        <MyInfoAccountMenuSection addressesMenuHref={MYPAGE_ADDRESSES_HREF} />
        <MyInfoServiceMenuSection />
        <MyPageAdminMenuEntry starbucks serverSeed={adminMenuSeed} />
        <MyInfoSupportMenuSection />
        <MyInfoPolicyMenuSection />
        <MyInfoDangerMenuSection />
      </div>
    </div>
  );
}
