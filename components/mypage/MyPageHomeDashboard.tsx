"use client";

import { useEffect, useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MypageProfileSummary } from "@/components/mypage/home/MypageProfileSummary";
import { MypageRequiredInfoSummary, useMypageRequiredInfoResult } from "@/components/mypage/home/MypageRequiredInfoSummary";
import { MypageSessionReloginCard } from "@/components/mypage/home/MypageSessionReloginCard";
import { useCustomerCenterUnreadTotal } from "@/components/mypage/myinfo/MyInfoHomeMenuSections";
import { MyInfoHomeCategoryGrid, MyInfoHomeNowStrip } from "@/components/mypage/myinfo/MyInfoHomeCategoryHub";
import {
  MypageHomeValuesProvider,
  type MypageHomeValues,
} from "@/components/mypage/home/mypage-home-values-context";
import { useMypageHomeSummary } from "@/hooks/use-mypage-home-summary";
import { useOwnerHubBadgeBreakdown } from "@/lib/chats/use-owner-hub-badge-total";
import { MYPAGE_HOME_BODY_CLASS, MYPAGE_HOME_CARD_CLASS } from "@/lib/ui/mypage-home-styles";
import { MYPAGE_HOME_MENU_FLOW_CLASS } from "@/lib/ui/mypage-responsive-breakpoints";
import type { MypageHomeProjection } from "@/lib/mypage/mypage-home-store";
import { useMypageProfileSheets } from "@/components/mypage/profile-settings/mypage-profile-sheets-context";
import type { MypageOwnerStoreGateSeed } from "@/lib/my/load-mypage-owner-store-gate-seed";
import type { MypageAdminMenuSeed } from "@/lib/my/load-mypage-admin-menu-seed";
import { MypageHomeCmsBanner } from "@/components/mypage/home/MypageHomeCmsBanner";
import { readMypageSummaryValue } from "@/lib/mypage/mypage-summary-types";

/**
 * 내정보 홈 (L0, `lib/mypage/mypage-ia.ts`) — 프로필 → 필수 정보(항상) → 진행 중 4칸 → 분류 카드 6개.
 * 메뉴 행은 홈에 나열하지 않는다: 분류 카드 → 분류 화면(L1)에서 그 분류 행만 본다.
 * 오른쪽 값·카드 숫자 = `useMypageHomeSummary` 1회(스냅샷 우선).
 * `ownerStoreGateSeed`·`adminMenuSeed` 는 분류 화면(매장·설정)이 서버에서 다시 읽는다 — 홈 시그니처는 호환용으로 유지.
 */
export function MyPageHomeDashboard({
  projection,
  onProfileRefresh,
  needsRelogin = false,
  loadFailed = false,
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
  /** 요약 1회 비행(루트 네트워크 계약 K11) — 분류 화면도 같은 스냅샷을 읽는다 */
  const summary = useMypageHomeSummary(!needsRelogin);
  const { chatUnread } = useOwnerHubBadgeBreakdown();
  const homeValues = useMemo<MypageHomeValues>(
    () => ({
      summary,
      tradeChatUnread: Number.isFinite(chatUnread) ? Math.max(0, Math.floor(chatUnread)) : 0,
    }),
    [summary, chatUnread],
  );
  const ccUnread = useCustomerCenterUnreadTotal();
  const required = useMypageRequiredInfoResult(projection, loadFailed);
  const requiredLeft = required.settled && !required.rows.some((r) => r.tone === "error")
    ? required.rows.filter((r) => r.tone !== "complete").length
    : null;

  useEffect(() => {
    if (!onProfileRefresh) return;
    setOnProfileUpdated(onProfileRefresh);
  }, [onProfileRefresh, setOnProfileUpdated]);

  const summaryTrust = readMypageSummaryValue(homeValues.summary?.fields?.trust);
  /** 광고 최종 점검: 노출 배너 목록 — 닫으면 다음 배너. 목록이 없는 옛 세션 스냅샷은 첫 배너 1건으로 */
  const bannerList = readMypageSummaryValue(homeValues.summary?.fields?.banners);
  const firstBanner = readMypageSummaryValue(homeValues.summary?.fields?.banner) ?? null;
  const banners = bannerList ?? (firstBanner ? [firstBanner] : []);

  return (
    <MypageHomeValuesProvider value={homeValues}>
      <div className={MYPAGE_HOME_BODY_CLASS} data-mypage-ia="category-hub">
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
              <MypageRequiredInfoSummary projection={null} onProfileRefresh={onProfileRefresh} loadFailed />
            </>
          ) : (
            <>
              <MypageProfileSummary projection={projection} summaryTrust={summaryTrust} />
              <MypageRequiredInfoSummary
                projection={projection}
                onProfileRefresh={onProfileRefresh}
                loadFailed={loadFailed}
              />
            </>
          )}

          {!needsRelogin ? <MyInfoHomeNowStrip values={homeValues} /> : null}
          {!needsRelogin && !loadFailed ? <MypageHomeCmsBanner banners={banners} /> : null}
          <MyInfoHomeCategoryGrid values={homeValues} requiredLeft={requiredLeft} ccUnread={ccUnread} />
        </div>
      </div>
    </MypageHomeValuesProvider>
  );
}
