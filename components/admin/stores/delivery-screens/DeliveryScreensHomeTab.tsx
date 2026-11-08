"use client";

/**
 * 5-F 홈 탭 — 고객 홈 화면 구역을 앱 순서대로: 히어로 배너 → 홈 선반 → 「더 많은 매장」 앞 배너 → 「더 많은 매장」.
 * 편집은 기존 화면·저장 API 를 그대로 쓴다 (선반 편집기 · 홈 광고 정책 패널). 현황 숫자는 기존 조회 API.
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { Sam } from "@/lib/ui/sam-component-classes";
import { DELIVERY_AD_ADMIN_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";
import { STAGE2_SINGLE_BANNER_ADMIN_CAPACITY } from "@/lib/stores/advertising/delivery-ad-stage2-surface-contract";
import type { PolicyCampaignCounts } from "@/lib/stores/advertising/delivery-ad-policy-campaign-counts";
import type { PlacementInventoryModel } from "@/lib/admin/ads-exposure/placement-inventory";
import type { StoresHomeShelfResolvedConfig } from "@/lib/stores/product/stores-home-shelf-product-resolve";
import { isHomeRestPaidInsertionOn, isHomeRestShelf } from "@/lib/stores/product/stores-home-shelf-admin-tabs";
import { AdminStoresHomeShelvesEditor } from "@/components/admin/stores/AdminStoresHomeShelvesPage";
import { AdminDeliveryAdHomePolicyPanel } from "@/components/admin/stores/AdminDeliveryAdPlacementPolicyPanel";
import { DeliveryScreensSection, DeliveryScreensStat } from "./DeliveryScreensSection";
import {
  fetchDeliveryAdPolicyCountsResult,
  fetchHeroPlacementResult,
  type DeliveryScreensFetchResult,
} from "./delivery-screens-status";
import { AdminErrorState } from "@/components/admin/ui/AdminStateViews";

type FetchError = { code: string; status?: number };

/** 구역별 현황 — 실패(error)와 아직 불러오는 중(null)을 구분한다 (v4 UI-06). */
type HomeStatus = {
  hero: PlacementInventoryModel["hero"] | null;
  heroError: FetchError | null;
  bannerCounts: PolicyCampaignCounts | null;
  bannerCountsError: FetchError | null;
  restCounts: PolicyCampaignCounts | null;
  restCountsError: FetchError | null;
};

type ShelvesStatus = {
  restAdIntegration: string | null;
  restLoaded: boolean;
  error: FetchError | null;
};

function countValue(n: number | null | undefined): string {
  return n == null ? "-" : String(n);
}

function errOf<T>(r: DeliveryScreensFetchResult<T>): FetchError | null {
  return r.ok ? null : { code: r.code, status: r.status };
}

/**
 * v4 PERF-18 — 홈 탭 GET 정리:
 * - 홈 선반 GET 은 선반 편집기 1회만 (편집기 `onLoaded` 로 현황 공유)
 * - STORES_HOME_FEED 집행 수는 여기서 1회 조회해 홈 광고 정책 패널에 넘긴다 (`feedCounts`)
 * - 집행 수는 목록 500건이 아니라 서버 페이지 limit=1 응답의 `policyCounts`
 */
export function DeliveryScreensHomeTab() {
  const { t, language } = useI18n();
  const ko = language === "ko";
  const [reloadTick, setReloadTick] = useState(0);
  const [status, setStatus] = useState<HomeStatus>({
    hero: null,
    heroError: null,
    bannerCounts: null,
    bannerCountsError: null,
    restCounts: null,
    restCountsError: null,
  });
  const [shelves, setShelves] = useState<ShelvesStatus>({ restAdIntegration: null, restLoaded: false, error: null });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [hero, bannerCounts, restCounts] = await Promise.all([
        fetchHeroPlacementResult(),
        fetchDeliveryAdPolicyCountsResult({ inventory: "STORES_HOME_INLINE_1" }),
        // FEED 는 매장 광고(store_sponsored)만 집행 — 정책 패널과 같은 조건으로 1회만 조회해 공유
        fetchDeliveryAdPolicyCountsResult({ inventory: "STORES_HOME_FEED", product: "store_sponsored" }),
      ]);
      if (cancelled) return;
      setStatus({
        hero: hero.ok ? hero.value : null,
        heroError: errOf(hero),
        bannerCounts: bannerCounts.ok ? bannerCounts.value : null,
        bannerCountsError: errOf(bannerCounts),
        restCounts: restCounts.ok ? restCounts.value : null,
        restCountsError: errOf(restCounts),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadTick]);

  const onShelvesLoaded = useCallback(
    (
      result: { ok: true; shelves: StoresHomeShelfResolvedConfig[] } | { ok: false; code: string; status?: number }
    ) => {
      if (!result.ok) {
        setShelves({ restAdIntegration: null, restLoaded: false, error: { code: result.code, status: result.status } });
        return;
      }
      const rest = result.shelves.find((s) => isHomeRestShelf(s));
      setShelves({ restAdIntegration: rest?.adIntegration ?? null, restLoaded: true, error: null });
    },
    []
  );

  const retryStatus = useCallback(() => setReloadTick((n) => n + 1), []);
  const onShelvesSaved = useCallback(() => setReloadTick((n) => n + 1), []);
  const heroUsed = status.hero ? status.hero.slots.filter((slot) => slot.campaignId).length : null;
  const restAdOn = isHomeRestPaidInsertionOn(shelves.restAdIntegration);

  return (
    <div className="space-y-4" data-delivery-screens-tab="home">
      <DeliveryScreensSection
        index={1}
        sectionKey="home_hero"
        title={t("admin_stores_top_hero_banner")}
        desc={t("admin_stores_swipeable_banner_at_top_of_home")}
        status={
          <>
            <DeliveryScreensStat label={t("admin_stores_live")} value={countValue(heroUsed)} />
            <DeliveryScreensStat label={t("admin_stores_capacity")} value={countValue(status.hero?.capacity)} />
          </>
        }
        actions={
          <>
            <Link href={DELIVERY_AD_ADMIN_ROUTES.firstPartyNew} className={Sam.btn.secondary} data-delivery-screens-hero-create="1">
              {t("admin_stores_create_banner")}
            </Link>
            <Link href="/admin/advertising/placements" className={Sam.btn.secondary}>
              {t("admin_stores_manage_order")}
            </Link>
          </>
        }
      >
        {status.hero ? (
          <ol className="space-y-1 text-[13px]" data-delivery-screens-hero-slots="1">
            {status.hero.slots.map((slot) => (
              <li key={slot.slideIndex} className="flex items-center gap-2">
                <span className="w-5 text-[12px] font-semibold text-sam-muted">{slot.slideIndex}</span>
                <span className={slot.campaignId ? "text-sam-fg" : "text-sam-muted"}>
                  {slot.campaignId ? slot.campaignLabel ?? t("admin_stores_untitled") : t("admin_stores_empty")}
                </span>
                {slot.scheduleLabel ? <span className="text-[12px] text-sam-muted">{slot.scheduleLabel}</span> : null}
              </li>
            ))}
          </ol>
        ) : status.heroError ? (
          <AdminErrorState ko={ko} code={status.heroError.code} httpStatus={status.heroError.status} onRetry={retryStatus} />
        ) : (
          <p className="text-[12px] text-sam-muted">{t("admin_stores_loading_hero_status")}</p>
        )}
      </DeliveryScreensSection>

      <DeliveryScreensSection
        index={2}
        sectionKey="home_shelves"
        title={t("admin_stores_home_shelves")}
        desc={t("admin_stores_edit_shelf_order_data_display_and")}
      >
        <AdminStoresHomeShelvesEditor embedded onSaved={onShelvesSaved} onLoaded={onShelvesLoaded} />
      </DeliveryScreensSection>

      <DeliveryScreensSection
        index={3}
        sectionKey="home_before_rest_banner"
        title={t("admin_stores_banner_before_remaining_stores")}
        desc={t("admin_stores_banner_slot_between_shelves_and_remaining")}
        status={
          <>
            <DeliveryScreensStat label={t("admin_stores_live")} value={countValue(status.bannerCounts?.exposable_now)} />
            <DeliveryScreensStat label={t("admin_stores_in_review")} value={countValue(status.bannerCounts?.under_review)} />
            {/* 광고 최종 점검 B-3: 보이는 건 1개, 첫 배너를 볼 수 없거나 이미지가 깨지면 예비 배너가 대신 나온다 */}
            <DeliveryScreensStat
              label={t("admin_stores_shown_at_once")}
              value={countValue(STAGE2_SINGLE_BANNER_ADMIN_CAPACITY.STORES_HOME_INLINE_1.visibleAtOnce)}
            />
            <DeliveryScreensStat
              label={t("admin_stores_max_incl_spares")}
              value={countValue(STAGE2_SINGLE_BANNER_ADMIN_CAPACITY.STORES_HOME_INLINE_1.registrationMax)}
            />
          </>
        }
      >
        {status.bannerCountsError ? (
          <AdminErrorState
            ko={ko}
            code={status.bannerCountsError.code}
            httpStatus={status.bannerCountsError.status}
            onRetry={retryStatus}
          />
        ) : null}
        {shelves.restLoaded ? (
          <AdminDeliveryAdHomePolicyPanel
            restShelfAdIntegration={shelves.restAdIntegration}
            feedCounts={status.restCounts}
          />
        ) : shelves.error ? (
          <p className="text-[12px] text-sam-danger" role="alert">
            {t("admin_stores_home_shelves_failed_to_load_so")}
          </p>
        ) : null}
      </DeliveryScreensSection>

      <DeliveryScreensSection
        index={4}
        sectionKey="home_rest_stores"
        title={t("admin_stores_remaining_stores")}
        desc={
          t("admin_stores_this_single_value_switches_ad_insertion")
        }
        status={
          <>
            <DeliveryScreensStat
              label={t("admin_stores_ad_insertion")}
              value={shelves.restLoaded ? (restAdOn ? t("admin_stores_on_3") : t("admin_stores_off_3")) : "-"}
            />
            <DeliveryScreensStat label={t("admin_stores_live_ads")} value={countValue(status.restCounts?.exposable_now)} />
            <DeliveryScreensStat label={t("admin_stores_in_review")} value={countValue(status.restCounts?.under_review)} />
          </>
        }
      >
        {status.restCountsError ? (
          <AdminErrorState
            ko={ko}
            code={status.restCountsError.code}
            httpStatus={status.restCountsError.status}
            onRetry={retryStatus}
          />
        ) : null}
      </DeliveryScreensSection>

    </div>
  );
}
