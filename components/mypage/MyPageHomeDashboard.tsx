"use client";

import { useEffect, useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
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
import {
  MypageHomeValuesProvider,
  type MypageHomeValues,
} from "@/components/mypage/home/mypage-home-values-context";
import { MYPAGE_HOME_BODY_CLASS, MYPAGE_HOME_CARD_CLASS } from "@/lib/ui/mypage-home-starbucks-styles";
import { MYPAGE_HOME_MENU_FLOW_CLASS } from "@/lib/ui/mypage-responsive-breakpoints";
import type { MypageHomeProjection } from "@/lib/mypage/mypage-home-store";
import { MYPAGE_ADDRESSES_HREF } from "@/lib/mypage/mypage-profile-routes";
import { useMypageProfileSheets } from "@/components/mypage/profile-settings/mypage-profile-sheets-context";
import { useMypageHubScrollRestore } from "@/lib/mypage/use-mypage-hub-scroll-restore";
import type { MypageOwnerStoreGateSeed } from "@/lib/my/load-mypage-owner-store-gate-seed";
import type { MypageAdminMenuSeed } from "@/lib/my/load-mypage-admin-menu-seed";
import { MypageHomeCmsBanner } from "@/components/mypage/home/MypageHomeCmsBanner";
import { useMypageHomeSummary } from "@/hooks/use-mypage-home-summary";
import { useOwnerHubBadgeBreakdown } from "@/lib/chats/use-owner-hub-badge-total";
import { readMypageSummaryValue } from "@/lib/mypage/mypage-summary-types";

/**
 * Legacy IA — single behavior-flow column (all viewports).
 * identity → activity → store → assets → account → service → support → policy → danger → (admin, 맨 끝)
 * 순서 SSOT = `MYPAGE_HOME_MEMBER_GROUP_ORDER` (단위 테스트가 이 JSX 순서와 비교).
 * 오른쪽 값 = `useMypageHomeSummary` 1회(행은 정적 설정이라 즉시, 값은 스냅샷 또는 미니 스켈레톤 → 응답 후 채움).
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
  const summary = useMypageHomeSummary(!needsRelogin);
  const { chatUnread } = useOwnerHubBadgeBreakdown();

  useEffect(() => {
    if (!onProfileRefresh) return;
    setOnProfileUpdated(onProfileRefresh);
  }, [onProfileRefresh, setOnProfileUpdated]);

  const homeValues = useMemo<MypageHomeValues>(
    () => ({
      summary,
      tradeChatUnread: Number.isFinite(chatUnread) ? Math.max(0, Math.floor(chatUnread)) : 0,
    }),
    [summary, chatUnread],
  );
  const summaryTrust = readMypageSummaryValue(summary?.fields?.trust);
  const banner = readMypageSummaryValue(summary?.fields?.banner) ?? null;

  return (
    <MypageHomeValuesProvider value={homeValues}>
      <div className={MYPAGE_HOME_BODY_CLASS} data-mypage-ia="legacy-flow">
        <div className={MYPAGE_HOME_MENU_FLOW_CLASS}>
          {needsRelogin ? (
            <MypageSessionReloginCard />
          ) : loadFailed && !projection ? (
            <>
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
            {/* 필수 정보 3행은 조회 실패에도 자리를 지키고 「확인 불가」+[다시 시도]로 표시 (real-screen-redesign §11) */}
            <MypageRequiredInfoSummary
              projection={null}
              onProfileRefresh={onProfileRefresh}
              loadFailed
            />
            </>
          ) : (
            <>
              <MypageProfileSummary projection={projection} summaryTrust={summaryTrust} />
              <MypageRequiredInfoSummary
                projection={projection}
                onProfileRefresh={onProfileRefresh}
                loadFailed={loadFailed}
              />
              <MypageHomeCmsBanner banner={banner} />
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
          <MyInfoSupportMenuSection />
          <MyInfoPolicyMenuSection />
          <MyInfoDangerMenuSection />
          {/* K5/X5 — 관리자 행은 위험 그룹 다음 맨 끝(늦게 나타나도 위 그룹을 밀지 않음) */}
          <MyPageAdminMenuEntry starbucks serverSeed={adminMenuSeed} />
        </div>
      </div>
    </MypageHomeValuesProvider>
  );
}
