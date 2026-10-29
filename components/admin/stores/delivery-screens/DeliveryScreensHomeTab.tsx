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
import type { PolicyCampaignCounts } from "@/lib/stores/advertising/delivery-ad-policy-campaign-counts";
import type { PlacementInventoryModel } from "@/lib/admin/ads-exposure/placement-inventory";
import type { StoresHomeShelfResolvedConfig } from "@/lib/stores/product/stores-home-shelf-product-resolve";
import { isHomeRestPaidInsertionOn, isHomeRestShelf } from "@/lib/stores/product/stores-home-shelf-admin-tabs";
import { AdminStoresHomeShelvesEditor } from "@/components/admin/stores/AdminStoresHomeShelvesPage";
import { AdminDeliveryAdHomePolicyPanel } from "@/components/admin/stores/AdminDeliveryAdPlacementPolicyPanel";
import { DeliveryScreensSection, DeliveryScreensStat } from "./DeliveryScreensSection";
import { fetchDeliveryAdPolicyCounts, fetchHeroPlacement } from "./delivery-screens-status";

type HomeStatus = {
  hero: PlacementInventoryModel["hero"] | null;
  restAdIntegration: string | null;
  restLoaded: boolean;
  bannerCounts: PolicyCampaignCounts | null;
  restCounts: PolicyCampaignCounts | null;
};

function countValue(n: number | null | undefined): string {
  return n == null ? "-" : String(n);
}

export function DeliveryScreensHomeTab() {
  const { language } = useI18n();
  const ko = language === "ko";
  const [reloadTick, setReloadTick] = useState(0);
  const [status, setStatus] = useState<HomeStatus>({
    hero: null,
    restAdIntegration: null,
    restLoaded: false,
    bannerCounts: null,
    restCounts: null,
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [hero, shelvesJson, bannerCounts, restCounts] = await Promise.all([
        fetchHeroPlacement(),
        fetch("/api/admin/stores-home-shelves", { credentials: "include", cache: "no-store" })
          .then((r) => r.json() as Promise<{ ok?: boolean; shelves?: StoresHomeShelfResolvedConfig[] }>)
          .catch(() => null),
        fetchDeliveryAdPolicyCounts({ inventory: "STORES_HOME_INLINE_1" }),
        fetchDeliveryAdPolicyCounts({ inventory: "STORES_HOME_FEED" }),
      ]);
      if (cancelled) return;
      const rest = shelvesJson?.ok ? shelvesJson.shelves?.find((s) => isHomeRestShelf(s)) : undefined;
      setStatus({
        hero,
        restAdIntegration: rest?.adIntegration ?? null,
        restLoaded: Boolean(shelvesJson?.ok),
        bannerCounts,
        restCounts,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadTick]);

  const onShelvesSaved = useCallback(() => setReloadTick((n) => n + 1), []);
  const heroUsed = status.hero ? status.hero.slots.filter((slot) => slot.campaignId).length : null;
  const restAdOn = isHomeRestPaidInsertionOn(status.restAdIntegration);

  return (
    <div className="space-y-4" data-delivery-screens-tab="home">
      <DeliveryScreensSection
        index={1}
        sectionKey="home_hero"
        title={ko ? "상단 히어로 배너" : "Top hero banner"}
        desc={ko ? "홈 맨 위에 넘겨 보는 배너입니다. 순서는 「노출 위치 현황」에서 바꿉니다." : "Swipeable banner at the top of HOME. Change order in placements."}
        status={
          <>
            <DeliveryScreensStat label={ko ? "집행 중" : "Live"} value={countValue(heroUsed)} />
            <DeliveryScreensStat label={ko ? "용량" : "Capacity"} value={countValue(status.hero?.capacity)} />
          </>
        }
        actions={
          <>
            <Link href={DELIVERY_AD_ADMIN_ROUTES.firstPartyNew} className={Sam.btn.secondary} data-delivery-screens-hero-create="1">
              {ko ? "배너 등록" : "Create banner"}
            </Link>
            <Link href="/admin/advertising/placements" className={Sam.btn.secondary}>
              {ko ? "순서 관리" : "Manage order"}
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
                  {slot.campaignId ? slot.campaignLabel ?? (ko ? "제목 없음" : "Untitled") : ko ? "비어 있음" : "Empty"}
                </span>
                {slot.scheduleLabel ? <span className="text-[12px] text-sam-muted">{slot.scheduleLabel}</span> : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-[12px] text-sam-muted">{ko ? "히어로 현황을 불러오는 중이거나 불러오지 못했습니다." : "Hero status is loading or unavailable."}</p>
        )}
      </DeliveryScreensSection>

      <DeliveryScreensSection
        index={2}
        sectionKey="home_shelves"
        title={ko ? "홈 선반" : "HOME shelves"}
        desc={ko ? "선반 순서·데이터·표현·노출을 편집합니다. 「더 많은 매장」은 항상 마지막입니다." : "Edit shelf order, data, display and exposure. Remaining stores always comes last."}
      >
        <AdminStoresHomeShelvesEditor embedded onSaved={onShelvesSaved} />
      </DeliveryScreensSection>

      <DeliveryScreensSection
        index={3}
        sectionKey="home_before_rest_banner"
        title={ko ? "「더 많은 매장」 앞 배너" : "Banner before remaining stores"}
        desc={ko ? "선반과 「더 많은 매장」 사이 배너 지면입니다. 켜기/끄기는 아래 패널에서 바로 저장됩니다." : "Banner slot between shelves and remaining stores. The toggle below saves immediately."}
        status={
          <>
            <DeliveryScreensStat label={ko ? "집행 중" : "Live"} value={countValue(status.bannerCounts?.exposable_now)} />
            <DeliveryScreensStat label={ko ? "심사 중" : "In review"} value={countValue(status.bannerCounts?.under_review)} />
          </>
        }
      >
        {status.restLoaded ? <AdminDeliveryAdHomePolicyPanel restShelfAdIntegration={status.restAdIntegration} /> : null}
      </DeliveryScreensSection>

      <DeliveryScreensSection
        index={4}
        sectionKey="home_rest_stores"
        title={ko ? "더 많은 매장" : "Remaining stores"}
        desc={
          ko
            ? "광고 삽입 켜기/끄기 기준은 이 값 하나입니다. 바꾸려면 위 홈 선반에서 「더 많은 매장」 › 쿠폰·광고 탭에서 저장하세요."
            : "This single value switches ad insertion. Change it in HOME shelves › Remaining stores › Coupon · Ad, then save."
        }
        status={
          <>
            <DeliveryScreensStat
              label={ko ? "광고 삽입" : "Ad insertion"}
              value={status.restLoaded ? (restAdOn ? (ko ? "켜짐" : "On") : ko ? "꺼짐" : "Off") : "-"}
            />
            <DeliveryScreensStat label={ko ? "집행 중 광고" : "Live ads"} value={countValue(status.restCounts?.exposable_now)} />
            <DeliveryScreensStat label={ko ? "심사 중" : "In review"} value={countValue(status.restCounts?.under_review)} />
          </>
        }
      />
    </div>
  );
}
