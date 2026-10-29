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
import {
  DELIVERY_SCREENS_ROUTE,
  fetchDeliveryAdPolicyCountsResult,
  fetchHeroPlacementResult,
  type DeliveryScreensFetchResult,
} from "./delivery-screens-status";
import { AdminErrorState } from "@/components/admin/ui/AdminStateViews";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { dibayAlert } from "@/components/ui/dibay-overlay";
import { clearStoresTaxonomyClientCache } from "@/lib/stores/store-delivery-api-client";
import type { DeliveryMenuAdminRow } from "@/lib/stores/delivery-menus/delivery-menu-types";
import { fetchDeliveryMenusAdmin, reorderDeliveryMenusHome } from "./delivery-menus-admin-api";
import { deliveryMenuErrorText, moveSiblingOrder } from "./delivery-menus-admin-model";

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
  const { language } = useI18n();
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
        ) : status.heroError ? (
          <AdminErrorState ko={ko} code={status.heroError.code} httpStatus={status.heroError.status} onRetry={retryStatus} />
        ) : (
          <p className="text-[12px] text-sam-muted">{ko ? "히어로 현황을 불러오는 중입니다." : "Loading hero status…"}</p>
        )}
      </DeliveryScreensSection>

      <DeliveryScreensSection
        index={2}
        sectionKey="home_shelves"
        title={ko ? "홈 선반" : "HOME shelves"}
        desc={ko ? "선반 순서·데이터·표현·노출을 편집합니다. 「더 많은 매장」은 항상 마지막입니다." : "Edit shelf order, data, display and exposure. Remaining stores always comes last."}
      >
        <AdminStoresHomeShelvesEditor embedded onSaved={onShelvesSaved} onLoaded={onShelvesLoaded} />
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
            {ko ? "홈 선반을 불러오지 못해 이 구역을 표시할 수 없습니다. 위 홈 선반에서 다시 불러오세요." : "HOME shelves failed to load, so this section is unavailable. Reload shelves above."}
          </p>
        ) : null}
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
              value={shelves.restLoaded ? (restAdOn ? (ko ? "켜짐" : "On") : ko ? "꺼짐" : "Off") : "-"}
            />
            <DeliveryScreensStat label={ko ? "집행 중 광고" : "Live ads"} value={countValue(status.restCounts?.exposable_now)} />
            <DeliveryScreensStat label={ko ? "심사 중" : "In review"} value={countValue(status.restCounts?.under_review)} />
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

      <DeliveryScreensHomeIconsSection ko={ko} />
    </div>
  );
}

/**
 * WP2 — 홈 아이콘: 「홈 아이콘에 표시」 1단 메뉴 순서 (PATCH home_order). 켜기·끄기는 메뉴 구성 탭에서.
 * v4 PERF-18 홈 탭 GET 예산(6회) 유지 — 메뉴 GET 은 운영자가 「순서 보기」를 눌렀을 때만.
 */
function DeliveryScreensHomeIconsSection({ ko }: { ko: boolean }) {
  const [menus, setMenus] = useState<DeliveryMenuAdminRow[] | null | undefined>(undefined);
  const [error, setError] = useState<FetchError | null>(null);
  const [busy, setBusy] = useState(false);
  /** 0 = 아직 열지 않음 (GET 없음) */
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (tick === 0) return;
    let cancelled = false;
    void (async () => {
      const r = await fetchDeliveryMenusAdmin();
      if (cancelled) return;
      if (!r.ok) {
        setError({ code: r.code, status: r.status });
        return;
      }
      setError(null);
      setMenus(r.value.menus);
    })();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  const homeIcons = (menus ?? [])
    .filter((m) => m.parent_id == null && m.show_on_home)
    .sort((a, b) => a.home_sort_order - b.home_sort_order || a.sort_order - b.sort_order);

  const move = async (id: string, delta: -1 | 1) => {
    const order = moveSiblingOrder(
      homeIcons.map((m) => m.id),
      id,
      delta
    );
    if (!order) return;
    setBusy(true);
    try {
      const r = await reorderDeliveryMenusHome(order.map((o) => ({ id: o.id, home_sort_order: o.sort_order })));
      if (!r.ok) await dibayAlert({ title: deliveryMenuErrorText(r.code, ko) });
      clearStoresTaxonomyClientCache();
      setTick((n) => n + 1);
    } finally {
      setBusy(false);
    }
  };

  return (
    <DeliveryScreensSection
      index={5}
      sectionKey="home_menu_icons"
      title={ko ? "홈 아이콘" : "Home icons"}
      desc={
        ko
          ? "홈에 아이콘으로 보이는 1단 메뉴 순서입니다. 표시 켜기·끄기와 아이콘 이미지는 「메뉴 구성」 탭에서 바꿉니다."
          : "Order of level-1 menus shown as HOME icons. Toggle and icon images live in the Menus tab."
      }
      status={<DeliveryScreensStat label={ko ? "표시 중" : "Shown"} value={menus ? String(homeIcons.length) : "-"} />}
      actions={
        <Link href={`${DELIVERY_SCREENS_ROUTE}?tab=browse`} className={Sam.btn.secondary} data-delivery-screens-menus-link="1">
          {ko ? "메뉴 구성" : "Menus"}
        </Link>
      }
    >
      {tick === 0 ? (
        <AdminActionButton size="sm" variant="secondary" onClick={() => setTick(1)} data-delivery-screens-home-icons-open="1">
          {ko ? "홈 아이콘 순서 보기" : "Show home icon order"}
        </AdminActionButton>
      ) : error ? (
        <AdminErrorState ko={ko} code={error.code} httpStatus={error.status} onRetry={() => setTick((n) => n + 1)} />
      ) : menus === undefined ? (
        <p className="text-[12px] text-sam-muted">{ko ? "홈 아이콘을 불러오는 중입니다." : "Loading home icons…"}</p>
      ) : menus === null ? (
        <p className="text-[12px] text-sam-muted">
          {ko
            ? "메뉴 테이블이 아직 적용되지 않았습니다. 고객 화면은 업종 그대로 보입니다."
            : "The menu tables are not applied yet. Customers see the category taxonomy as is."}
        </p>
      ) : homeIcons.length === 0 ? (
        <p className="text-[12px] text-sam-muted">
          {ko ? "홈 아이콘으로 표시하는 1단 메뉴가 없습니다." : "No level-1 menus are shown as HOME icons."}
        </p>
      ) : (
        <ol className="space-y-1" data-delivery-screens-home-icons="1">
          {homeIcons.map((m, i) => (
            <li key={m.id} className="flex items-center gap-2 text-[13px]">
              <span className="w-5 text-[12px] font-semibold text-sam-muted">{i + 1}</span>
              <span className={m.is_active ? "flex-1 text-sam-fg" : "flex-1 text-sam-muted"}>
                {m.name_ko}
                {m.is_active ? "" : ko ? " (미노출)" : " (hidden)"}
              </span>
              <AdminActionButton size="sm" variant="neutral" className="!px-2" disabled={busy || i === 0} onClick={() => void move(m.id, -1)} aria-label={ko ? "위로" : "Up"}>
                ↑
              </AdminActionButton>
              <AdminActionButton
                size="sm"
                variant="neutral"
                className="!px-2"
                disabled={busy || i === homeIcons.length - 1}
                onClick={() => void move(m.id, 1)}
                aria-label={ko ? "아래로" : "Down"}
              >
                ↓
              </AdminActionButton>
            </li>
          ))}
        </ol>
      )}
    </DeliveryScreensSection>
  );
}
