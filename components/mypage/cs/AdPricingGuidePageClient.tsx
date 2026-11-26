"use client";

/**
 * 내정보 › 고객센터 › 공지사항 › 「광고 요금 안내」 고정 게시물 (광고 감사 E · 시안 ②③).
 * 공지 글(app_notices)이 아니다 — 공지 본문은 표를 못 그리고 어드민 금액과 연결되지 않아(설계 §7),
 * 열 때마다 `GET /api/ads/pricing-guide`(결제 창과 같은 표)를 읽어 그린다.
 */
import Link from "next/link";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MyScreen } from "@/components/mypage/ds/MyScreen";
import { MyStateView } from "@/components/mypage/ds/MyStateView";
import { MyStickyCta } from "@/components/mypage/ds/MyStickyCta";
import {
  AdPricingGuideTable,
  formatAdGuidePhpMinor,
  type AdPricingGuideTab,
} from "@/components/ads/AdPricingGuideTable";
import type { AdPricingGuide, AdPricingMine } from "@/lib/ads/ad-pricing-guide";
import { appendOwnerSearchParams, OwnerRoutes } from "@/lib/business/owner-routes";
import { formatPhtDisplayDateTime } from "@/lib/time/format-pht-display";
import { buildCustomerCenterBoardListPath } from "@/lib/notices/customer-center-content-paths";
import { CC_CATEGORY_CHIP_CLASS, CC_NOTE_CLASS, CC_TITLE_CLASS } from "@/lib/mypage/customer-center-ui";
import {
  getOwnerLiteStoreServerSnapshot,
  getOwnerLiteStoreSnapshot,
  subscribeOwnerLiteStore,
} from "@/lib/stores/owner-lite-external-store";
import { buildMemberSupportContext, buildOwnerSupportContext } from "@/lib/support/support-context";
import { navigateToSupportCenter } from "@/lib/support/open-support-center";

export function AdPricingGuidePageClient() {
  const { t, language } = useI18n();
  const searchParams = useSearchParams();
  const tabParam = searchParams?.get("tab");
  const owner = useSyncExternalStore(subscribeOwnerLiteStore, getOwnerLiteStoreSnapshot, getOwnerLiteStoreServerSnapshot);
  /** R-19: 승인된 매장이 있을 때만 사장님(「배달 광고」 문의·매장 탭 먼저) — 심사 중·반려만 있으면 회원(입점 문의) */
  const ownerStore = owner.ownerStores.find((s) => String(s.approval_status) === "approved") ?? null;
  const [guide, setGuide] = useState<AdPricingGuide | null>(null);
  /** 재감사 G-6: 내 포인트 · 내 매장 비즈 캐시 (비로그인 null) */
  const [mine, setMine] = useState<AdPricingMine | null>(null);
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState<AdPricingGuideTab | null>(
    tabParam === "store" || tabParam === "member" ? tabParam : null
  );
  /** 매장 사장님은 매장 탭이 먼저 (설계 §7) — 회원이 직접 고르면 그대로 */
  const tab: AdPricingGuideTab = picked ?? (ownerStore ? "store" : "member");

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetch("/api/ads/pricing-guide", { cache: "no-store", credentials: "include" });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; guide?: AdPricingGuide; mine?: AdPricingMine | null };
      if (!res.ok || !j.ok || !j.guide) {
        setFailed(true);
        return;
      }
      setGuide(j.guide);
      setMine(j.mine ?? null);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const inquire = () => {
    /** 회원 탭 → 「광고」 · 매장 탭 → 사장님이면 「배달 광고」, 매장 없으면 「입점 문의」 (설계 §7) */
    if (tab === "store" && ownerStore) {
      navigateToSupportCenter(
        buildOwnerSupportContext({
          enabled: true,
          category: "DELIVERY_AD",
          sourceSurface: "mypage_ad_pricing_guide",
          storeId: ownerStore.id,
        })
      );
      return;
    }
    navigateToSupportCenter(
      buildMemberSupportContext({
        enabled: true,
        category: tab === "store" ? "STORE_PARTNERSHIP" : "AD",
        sourceSurface: "mypage_ad_pricing_guide",
      })
    );
  };

  const backHref = buildCustomerCenterBoardListPath("notice");
  /** G-6: 탭에 맞는 잔액 — 회원 = 포인트, 매장 = 내 매장 비즈 캐시 (확인 실패 = 「확인 못 함」, 0 으로 쓰지 않음) */
  const balance =
    tab === "store"
      ? mine?.store
        ? {
            label: t("ad_guide_my_business_cash"),
            value:
              mine.store.businessCashMinor == null
                ? t("ad_guide_balance_unknown")
                : formatAdGuidePhpMinor(mine.store.businessCashMinor),
            chargeLabel: t("ad_guide_charge_cash"),
            chargeHref: appendOwnerSearchParams(OwnerRoutes.finance(mine.store.storeId), { section: "cash" }),
          }
        : null
      : mine
        ? {
            label: t("ad_guide_my_points"),
            value:
              mine.points == null
                ? t("ad_guide_balance_unknown")
                : `${Math.max(0, mine.points).toLocaleString(language === "en" ? "en-US" : "ko-KR")}P`,
            chargeLabel: t("ad_guide_charge_points"),
            chargeHref: "/mypage/points/charge",
          }
        : null;
  return (
    <MyScreen
      title={t("notices_notices")}
      backHref={backHref}
      fixedBackHistory="settle"
      template="detail"
      /** G-5: 「광고 문의하기」는 아래에 고정 */
      stickyCta={<MyStickyCta dirty primary={{ label: t("ad_guide_inquire"), onPress: inquire }} />}
    >
      <div className="space-y-3 pb-6" data-testid="ad-pricing-guide-page">
        <header className="space-y-2 rounded-ui-rect border border-sam-border-soft bg-sam-surface px-4 py-4">
          <div className="flex gap-1.5">
            <span className={`${CC_CATEGORY_CHIP_CLASS} !bg-sam-primary !text-sam-on-primary`}>{t("ad_guide_badge_pinned")}</span>
            <span className={CC_CATEGORY_CHIP_CLASS}>{t("ad_guide_badge_ad")}</span>
          </div>
          <h1 className={CC_TITLE_CLASS}>{t("ad_guide_title")}</h1>
          {guide ? (
            <p className={CC_NOTE_CLASS}>
              {t("ad_guide_stamp", { date: formatPhtDisplayDateTime(guide.at, language === "en" ? "en" : "ko") })}
            </p>
          ) : null}
          {balance ? (
            <div
              className="flex items-center justify-between gap-2 rounded-ui-rect bg-sam-primary-soft px-3 py-2.5"
              data-testid="ad-pricing-guide-balance"
            >
              <p className="min-w-0 text-[13px] text-sam-fg">
                {balance.label}
                <b className="block text-[16px] tabular-nums text-sam-primary">{balance.value}</b>
              </p>
              <Link
                href={balance.chargeHref}
                className="shrink-0 rounded-ui-rect border border-sam-primary bg-sam-surface px-2.5 py-1.5 text-[12px] font-bold text-sam-primary"
              >
                {balance.chargeLabel}
              </Link>
            </div>
          ) : null}
        </header>
        {failed ? (
          <MyStateView
            kind="error"
            template="detail"
            error={{ message: t("ad_guide_load_failed"), onRetry: () => void load() }}
          />
        ) : !guide ? (
          <MyStateView kind="loading" template="detail" />
        ) : (
          <AdPricingGuideTable guide={guide} tab={tab} onTabChange={setPicked} />
        )}
      </div>
    </MyScreen>
  );
}
