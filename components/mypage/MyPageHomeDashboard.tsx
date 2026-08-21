"use client";

import { useEffect } from "react";
import { MypageProfileSummary } from "@/components/mypage/home/MypageProfileSummary";
import { MypagePointsAssetSummary } from "@/components/mypage/home/MypagePointsAssetSummary";
import { MypageRequiredInfoSummary } from "@/components/mypage/home/MypageRequiredInfoSummary";
import { MypageSessionReloginCard } from "@/components/mypage/home/MypageSessionReloginCard";
import { MyPageAdminMenuEntry } from "@/components/mypage/MyPageAdminMenuEntry";
import {
  MyInfoAccountMenuSection,
  MyInfoDangerMenuSection,
  MyInfoPolicyMenuSection,
  MyInfoServiceMenuSection,
  MyInfoStoreMenuSection,
  MyInfoSupportMenuSection,
  MyInfoTradeMenuSection,
} from "@/components/mypage/myinfo/MyInfoHomeMenuSections";
import { MYPAGE_HOME_BODY_CLASS } from "@/lib/ui/mypage-home-starbucks-styles";
import { MYPAGE_HOME_MENU_FLOW_CLASS } from "@/lib/ui/mypage-responsive-breakpoints";
import type { MypageHomeProjection } from "@/lib/mypage/mypage-home-store";
import { MYPAGE_ADDRESSES_HREF } from "@/lib/mypage/mypage-profile-routes";
import { useMypageProfileSheets } from "@/components/mypage/profile-settings/mypage-profile-sheets-context";
import { useMypageHubScrollRestore } from "@/lib/mypage/use-mypage-hub-scroll-restore";
import type { MypageOwnerStoreGateSeed } from "@/lib/my/load-mypage-owner-store-gate-seed";

/**
 * Legacy IA — single behavior-flow column (all viewports).
 * identity → activity → store → assets → account → service → support → policy → danger
 * DO NOT reintroduce multi-column (2/3) menu catalogs.
 */
export function MyPageHomeDashboard({
  projection,
  onProfileRefresh,
  needsRelogin = false,
  ownerStoreGateSeed = null,
}: {
  projection: MypageHomeProjection | null;
  onProfileRefresh?: () => void;
  /** Local session present but profile resolve failed — show re-login, not endless checking. */
  needsRelogin?: boolean;
  ownerStoreGateSeed?: MypageOwnerStoreGateSeed | null;
}) {
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
        ) : (
          <>
            <MypageProfileSummary projection={projection} />
            <MypageRequiredInfoSummary projection={projection} onProfileRefresh={onProfileRefresh} />
          </>
        )}

        <MyInfoTradeMenuSection />
        <MyInfoStoreMenuSection
          ownerStoreGate={ownerStoreGateSeed?.ownerStoreGate}
          ownerStoreGateFirstId={ownerStoreGateSeed?.ownerStoreGateFirstId}
        />
        {!needsRelogin ? <MypagePointsAssetSummary /> : null}
        <MyInfoAccountMenuSection addressesMenuHref={MYPAGE_ADDRESSES_HREF} />
        <MyInfoServiceMenuSection />
        <MyPageAdminMenuEntry starbucks />
        <MyInfoSupportMenuSection />
        <MyInfoPolicyMenuSection />
        <MyInfoDangerMenuSection />
      </div>
    </div>
  );
}
