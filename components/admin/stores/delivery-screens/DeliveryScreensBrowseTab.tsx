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
import { STAGE2_SINGLE_BANNER_ADMIN_CAPACITY } from "@/lib/stores/advertising/delivery-ad-stage2-surface-contract";
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
  const { t } = useI18n();
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
  const onOff = (v: boolean | undefined) => (v == null ? "-" : v ? t("admin_stores_on_3") : t("admin_stores_off_3"));

  return (
    <div className="space-y-4" data-delivery-screens-tab="browse">
      <DeliveryScreensSection
        index={1}
        sectionKey="browse_status"
        title={t("admin_stores_selected_primary_saved_zone_status")}
        desc={
          t("admin_stores_screen_order_top_banner_discovery_shelf")
        }
        status={
          primarySlug ? (
            <>
              <DeliveryScreensStat label={t("admin_stores_top_banner")} value={onOff(resolved?.bannerAds.enabled)} />
              {/* 광고 최종 점검 B-3: 「배너 용량 1」 대신 보이는 수·예비 포함 등록 수용량을 따로 (홈 중간 배너와 같은 표기) */}
              <DeliveryScreensStat
                label={t("admin_stores_shown_at_once")}
                value={countValue(STAGE2_SINGLE_BANNER_ADMIN_CAPACITY.STORES_CATEGORY_TOP.visibleAtOnce)}
              />
              <DeliveryScreensStat
                label={t("admin_stores_max_incl_spares")}
                value={countValue(STAGE2_SINGLE_BANNER_ADMIN_CAPACITY.STORES_CATEGORY_TOP.registrationMax)}
              />
              <DeliveryScreensStat label={t("admin_stores_live_banners")} value={countValue(status?.bannerCounts?.exposable_now)} />
              <DeliveryScreensStat label={t("admin_stores_native_ads")} value={onOff(resolved?.adEnabled)} />
              <DeliveryScreensStat label={t("admin_stores_live_native_ads")} value={countValue(status?.nativeCounts?.exposable_now)} />
              <DeliveryScreensStat label={t("admin_stores_coupon_badges")} value={onOff(resolved?.couponEnabled)} />
            </>
          ) : (
            <span className="text-[12px] text-sam-muted">{t("admin_stores_pick_primary_to_see_status")}</span>
          )
        }
        actions={
          <Link href={DELIVERY_AD_ADMIN_ROUTES.firstPartyNew} className={Sam.btn.secondary}>
            {t("admin_stores_create_banner")}
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
