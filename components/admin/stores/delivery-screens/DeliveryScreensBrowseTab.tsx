"use client";

/**
 * 5-F 업종 목록 탭 — 선택한 1차 업종의 구역 현황(상단 배너·네이티브 광고) + 기존 업종 목록 정책 편집기.
 * 편집기 = `AdminStoresCategoryPolicyEditor` (1차/2차 선택 · 상단 배너 · 탐색 선반 · 정렬 · 네이티브 광고 · 쿠폰 배지).
 * 저장된 정책 값은 편집기 GET 결과(`onLoaded`)를 쓰고, 이 탭은 광고 집행 수만 조회한다 (v4 PERF-19).
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { Sam } from "@/lib/ui/sam-component-classes";
import { DELIVERY_AD_ADMIN_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";
import type { PolicyCampaignCounts } from "@/lib/stores/advertising/delivery-ad-policy-campaign-counts";
import type { StoresBrowseScopePolicyResolved } from "@/lib/stores/product/stores-browse-scope-policy-catalog";
import { AdminStoresCategoryPolicyEditor } from "@/components/admin/stores/AdminStoresCategoryPolicyPage";
import { DeliveryScreensSection, DeliveryScreensStat } from "./DeliveryScreensSection";
import { fetchDeliveryAdPolicyCounts } from "./delivery-screens-status";

type BrowseCounts = {
  primarySlug: string;
  bannerCounts: PolicyCampaignCounts | null;
  nativeCounts: PolicyCampaignCounts | null;
};

function countValue(n: number | null | undefined): string {
  return n == null ? "-" : String(n);
}

export function DeliveryScreensBrowseTab() {
  const { language } = useI18n();
  const ko = language === "ko";
  const searchParams = useSearchParams();
  const primarySlug = searchParams.get("primary")?.trim().toLowerCase() ?? "";
  const [counts, setCounts] = useState<BrowseCounts | null>(null);
  /** v4 PERF-19 — 저장된 정책 값은 편집기의 정책 GET 결과를 공유한다 (같은 GET 중복 제거). */
  const [policy, setPolicy] = useState<{ primarySlug: string; resolved: StoresBrowseScopePolicyResolved | null } | null>(
    null
  );
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (!primarySlug) {
      setCounts(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const [bannerCounts, nativeCounts] = await Promise.all([
        fetchDeliveryAdPolicyCounts({ inventory: "STORES_CATEGORY_TOP", primarySlug }),
        fetchDeliveryAdPolicyCounts({ inventory: "STORES_CATEGORY_FEED", primarySlug }),
      ]);
      if (cancelled) return;
      setCounts({ primarySlug, bannerCounts, nativeCounts });
    })();
    return () => {
      cancelled = true;
    };
  }, [primarySlug, reloadTick]);

  const onPolicyLoaded = useCallback(
    (result: {
      primarySlug: string;
      primaries: Array<{ primarySlug: string; resolved: StoresBrowseScopePolicyResolved }> | null;
    }) => {
      if (!result.primarySlug) return;
      setPolicy({
        primarySlug: result.primarySlug,
        resolved: result.primaries?.find((p) => p.primarySlug === result.primarySlug)?.resolved ?? null,
      });
    },
    []
  );

  const status = counts?.primarySlug === primarySlug ? counts : null;
  const resolved = policy?.primarySlug === primarySlug ? policy.resolved : null;
  const onOff = (v: boolean | undefined) => (v == null ? "-" : v ? (ko ? "켜짐" : "On") : ko ? "꺼짐" : "Off");

  return (
    <div className="space-y-4" data-delivery-screens-tab="browse">
      <DeliveryScreensSection
        index={1}
        sectionKey="browse_status"
        title={ko ? "선택한 1차 업종 구역 현황 (저장된 값)" : "Selected primary — saved zone status"}
        desc={
          ko
            ? "업종 목록 화면 순서: 상단 배너 → 탐색 선반·매장 목록(정렬) → 목록 사이 네이티브 광고 → 쿠폰 배지."
            : "Screen order: top banner → discovery shelf & list (sort) → native ads in list → coupon badges."
        }
        status={
          primarySlug ? (
            <>
              <DeliveryScreensStat label={ko ? "상단 배너" : "Top banner"} value={onOff(resolved?.bannerAds.enabled)} />
              <DeliveryScreensStat label={ko ? "배너 용량" : "Banner capacity"} value={countValue(resolved?.bannerAds.capacity)} />
              <DeliveryScreensStat label={ko ? "집행 배너" : "Live banners"} value={countValue(status?.bannerCounts?.exposable_now)} />
              <DeliveryScreensStat label={ko ? "네이티브 광고" : "Native ads"} value={onOff(resolved?.adEnabled)} />
              <DeliveryScreensStat label={ko ? "집행 네이티브 광고" : "Live native ads"} value={countValue(status?.nativeCounts?.exposable_now)} />
              <DeliveryScreensStat label={ko ? "쿠폰 배지" : "Coupon badges"} value={onOff(resolved?.couponEnabled)} />
            </>
          ) : (
            <span className="text-[12px] text-sam-muted">{ko ? "1차 업종을 고르면 현황이 보입니다." : "Pick a primary to see status."}</span>
          )
        }
        actions={
          <Link href={DELIVERY_AD_ADMIN_ROUTES.firstPartyNew} className={Sam.btn.secondary}>
            {ko ? "배너 등록" : "Create banner"}
          </Link>
        }
      />
      <AdminStoresCategoryPolicyEditor
        embedded
        onSaved={() => setReloadTick((n) => n + 1)}
        onLoaded={onPolicyLoaded}
      />
    </div>
  );
}
