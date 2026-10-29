"use client";

/**
 * Admin CATEGORY preview — live GET /api/stores/browse?primary=&sub= (앱과 같은 요청: limit 미지정 = 서버 기본).
 * 5-B CP-11 — 앱 응답을 그대로 그린다: 상단 배너 · 삽입 행 순서 · 탐색 선반 · `couponBadgeByStoreId` 쿠폰 배지.
 * 앱 카드·선반·배너 부품을 재사용하되 광고 노출 집계는 하지 않는다 (배너 = admin_preview · 노출 토큰 미전달 · 비콘 없음).
 */

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { BrowseStoreListItem } from "@/lib/stores/browse-api-types";
import {
  StoreBrowseCategoryRowCard,
  browseItemToRowCard,
  type StoreBrowseCampaignBenefit,
} from "@/components/stores/browse/StoreBrowseCategoryRowCard";
import { StoresBrowseDiscoveryShelf } from "@/components/stores/browse/StoresBrowseDiscoveryShelf";
import { DeliveryAdBanner } from "@/components/stores/advertising/DeliveryAdBanner";
import { inventoryViewFromKey } from "@/lib/stores/advertising/delivery-ad-banner-contract";
import type { PhysicalBannerResolvedSlide } from "@/lib/stores/load-delivery-ad-physical-banners";
import type { StoresBrowseInsertionMetaRow } from "@/lib/stores/composition/stores-composition-browse-insertion-meta";
import type { StoresBrowseDiscoveryShelfPayload } from "@/lib/stores/stores-browse-discovery-shelf";
import { networkDiscoveryShelfWins } from "@/lib/stores/stores-browse-shelf-snapshot-authority";
import { buildAdminBrowsePreviewItems } from "@/lib/stores/stores-browse-admin-preview-items";
import { formatMoneyPhp } from "@/lib/utils/format";

export type AdminCategoryBrowsePreviewProps = {
  primarySlug: string;
  /** `all` or secondary slug */
  subSlug: string;
  scopeLabel: string;
  scopeBreadcrumb: string;
  /** 초안 사용 여부 (저장 전 OFF 경고용 — 목록은 저장된 앱 응답) */
  draftEnabled: boolean;
  ko: boolean;
  /** Bump after save to re-fetch customer browse */
  reloadToken?: number;
};

type LoadState =
  | { status: "idle" | "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      stores: BrowseStoreListItem[];
      insertionRows: StoresBrowseInsertionMetaRow[] | null;
      couponBadgeByStoreId: Record<string, { title: string }>;
      discoveryShelf: StoresBrowseDiscoveryShelfPayload | null;
      banner: PhysicalBannerResolvedSlide | null;
      scopeEnabled: boolean;
      serverTitle: string | null;
      popularityRange: string | null;
    };

async function loadTopBanner(pk: string, sk: string): Promise<PhysicalBannerResolvedSlide | null> {
  const qs = new URLSearchParams({ primary: pk });
  if (sk !== "all") qs.set("sub", sk);
  try {
    const res = await fetch(`/api/stores/browse-top-banners?${qs.toString()}`, {
      credentials: "include",
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as {
      banners?: PhysicalBannerResolvedSlide[];
      physicalEnabled?: boolean;
    } | null;
    if (!json?.physicalEnabled || !Array.isArray(json.banners)) return null;
    /** 앱(`StoresBrowseTopBanner`)과 같이 이미지 있는 첫 슬라이드 1개 */
    return json.banners.find((b) => String(b.imageUrl ?? "").trim().length > 0) ?? null;
  } catch {
    return null;
  }
}

export function AdminStoresCategoryBrowseLivePreview({
  primarySlug,
  subSlug,
  scopeLabel,
  scopeBreadcrumb,
  draftEnabled,
  ko,
  reloadToken = 0,
}: AdminCategoryBrowsePreviewProps) {
  const { t } = useI18n();
  const [state, setState] = useState<LoadState>({ status: "idle" });

  useEffect(() => {
    const pk = primarySlug.trim().toLowerCase();
    if (!pk) {
      setState({ status: "idle" });
      return;
    }
    const sk = (subSlug.trim().toLowerCase() || "all") === "all" ? "all" : subSlug.trim().toLowerCase();
    let cancelled = false;
    setState({ status: "loading" });
    void (async () => {
      try {
        /** 앱과 같은 요청 — limit 을 붙이지 않는다 (서버 기본 개수). */
        const qs = new URLSearchParams({ primary: pk, sub: sk, fresh: "1" });
        const [res, banner] = await Promise.all([
          fetch(`/api/stores/browse?${qs.toString()}`, { credentials: "include", cache: "no-store" }),
          loadTopBanner(pk, sk),
        ]);
        const json = (await res.json()) as {
          ok?: boolean;
          stores?: BrowseStoreListItem[];
          error?: string;
          meta?: {
            browseScopePolicy?: {
              enabled?: boolean;
              displayTitleKo?: string | null;
              displayTitleEn?: string | null;
            };
            browseInsertion?: {
              rows?: StoresBrowseInsertionMetaRow[];
              couponBadgeByStoreId?: Record<string, { title: string }>;
            };
            discoveryShelf?: unknown;
            popularitySinceIso?: string;
            popularityUntilIso?: string;
          };
        };
        if (cancelled) return;
        if (!json.ok || !Array.isArray(json.stores)) {
          setState({
            status: "error",
            message: json.error?.trim() || (ko ? "카테고리 목록을 불러오지 못했습니다." : "Failed to load category browse."),
          });
          return;
        }
        const pol = json.meta?.browseScopePolicy;
        const serverTitle =
          (ko ? pol?.displayTitleKo : pol?.displayTitleEn || pol?.displayTitleKo)?.trim() || null;
        const badges = json.meta?.browseInsertion?.couponBadgeByStoreId;
        const rows = json.meta?.browseInsertion?.rows;
        setState({
          status: "ready",
          stores: json.stores,
          insertionRows: Array.isArray(rows) ? rows : null,
          couponBadgeByStoreId: badges && typeof badges === "object" ? badges : {},
          discoveryShelf: networkDiscoveryShelfWins(undefined, json.meta?.discoveryShelf),
          banner,
          scopeEnabled: pol?.enabled !== false,
          serverTitle,
          popularityRange:
            json.meta?.popularitySinceIso && json.meta?.popularityUntilIso
              ? `${json.meta.popularitySinceIso} ~ ${json.meta.popularityUntilIso}`
              : null,
        });
      } catch (e) {
        if (cancelled) return;
        setState({
          status: "error",
          message: e instanceof Error ? e.message : ko ? "browse 오류" : "Browse error",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [primarySlug, subSlug, ko, reloadToken]);

  const headerTitle = scopeLabel.trim() || (state.status === "ready" ? state.serverTitle : null) || primarySlug;
  const readyState = state.status === "ready" ? state : null;
  const items = readyState
    ? buildAdminBrowsePreviewItems({
        stores: readyState.stores,
        insertionRows: readyState.insertionRows,
        couponBadgeByStoreId: readyState.couponBadgeByStoreId,
        discoveryShelf: readyState.discoveryShelf,
      })
    : [];

  return (
    <div
      className="mx-auto w-[242px] overflow-hidden rounded-[28px] border-[6px] border-sam-fg/80 bg-white shadow-xl"
      data-admin-category-card-preview="true"
      data-preview-live="true"
      data-preview-primary={primarySlug}
      data-preview-sub={subSlug}
    >
      <div className="bg-sam-app px-3 pb-3 pt-2">
        <p className="mb-1 text-center text-[12px] font-bold uppercase tracking-wide text-sam-success">
          {ko ? "실데이터 · 저장된 앱 응답" : "Live · saved app response"}
        </p>
        <p className="mb-1 truncate text-[12px] font-semibold text-sam-muted" title={scopeBreadcrumb}>
          {scopeBreadcrumb}
        </p>
        {readyState?.popularityRange ? (
          <p className="mb-1 break-all text-[12px] text-sam-muted">{readyState.popularityRange}</p>
        ) : null}
        <div className="mb-2 flex gap-1 overflow-x-auto">
          <span className="shrink-0 rounded-full bg-sam-fg px-2 py-1 text-[12px] font-bold text-white">
            {headerTitle}
          </span>
          <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[12px] font-bold text-sam-muted">
            {subSlug === "all" ? (ko ? "1차 전체(혼합)" : "Primary mix") : ko ? "2차만" : "Secondary only"}
          </span>
        </div>

        {!draftEnabled ? (
          <p className="mb-2 rounded-ui-rect bg-sam-danger-soft px-2 py-2 text-center text-[12px] font-semibold text-sam-danger">
            {ko ? "초안 OFF — 저장하면 고객 목록이 비워집니다." : "Draft OFF — customer list will be empty after save."}
          </p>
        ) : null}

        {state.status === "loading" || state.status === "idle" ? (
          <p className="px-2 py-8 text-center text-[12px] text-sam-muted">{ko ? "실데이터 로딩…" : "Loading live…"}</p>
        ) : state.status === "error" ? (
          <p className="px-2 py-6 text-center text-[12px] text-sam-danger">{state.message}</p>
        ) : !readyState || !readyState.scopeEnabled ? (
          <p className="rounded-ui-rect bg-sam-danger-soft px-2 py-6 text-center text-[12px] font-semibold text-sam-danger">
            {ko ? "저장 정책 OFF — 고객 목록 비움" : "Saved policy OFF — customer list empty"}
          </p>
        ) : (
          <>
            {readyState.banner ? (
              <div className="mb-2" data-admin-category-preview-top-banner="1">
                <DeliveryAdBanner
                  inventory={inventoryViewFromKey("STORES_CATEGORY_TOP")}
                  creative={{
                    assetUrl: readyState.banner.imageUrl,
                    headline: readyState.banner.title,
                    subcopy: readyState.banner.subtitle,
                    alt: readyState.banner.title,
                  }}
                  destination={{ href: "" }}
                  adLabel={
                    readyState.banner.isSampleStore ? t("store_insertion_sample_ad") : t("store_insertion_sponsored")
                  }
                  renderContext="admin_preview"
                  campaignId={readyState.banner.id}
                />
              </div>
            ) : null}
            {readyState.stores.length === 0 ? (
              <p className="rounded-ui-rect border border-dashed border-sam-border bg-white px-2 py-6 text-center text-[12px] text-sam-muted">
                {ko
                  ? "이 1·2차 스코프에 매장이 없습니다. (다른 업종 매장은 섞이지 않습니다)"
                  : "No stores in this primary/secondary scope. (Other industries are not mixed in.)"}
              </p>
            ) : (
              <ul className="space-y-2" data-admin-category-preview-list="1">
                {items.map((item) => {
                  if (item.kind === "discovery_shelf") {
                    return readyState.discoveryShelf ? (
                      <StoresBrowseDiscoveryShelf key={item.key} shelf={readyState.discoveryShelf} />
                    ) : null;
                  }
                  if (item.kind === "organic") {
                    return (
                      <StoreBrowseCategoryRowCard
                        key={item.key}
                        data={browseItemToRowCard(item.store)}
                        locale={ko ? "ko" : "en"}
                        couponBadgeTitle={item.couponBadge ? t("store_badge_coupon") : null}
                      />
                    );
                  }
                  const campaignBenefit: StoreBrowseCampaignBenefit =
                    item.kind === "paid_ad"
                      ? { kind: "paid_ad", promoLine: item.promoLine, sponsored: true }
                      : {
                          kind: "coupon",
                          promoLine: `${item.row.title} · ${
                            item.row.discountType === "percent"
                              ? `${item.row.discountValue}%`
                              : formatMoneyPhp(item.row.discountValue)
                          }`,
                        };
                  /** 앱은 여기서 노출 비콘을 붙인다 — 미리보기는 붙이지 않는다 (노출 집계 없음). */
                  return (
                    <StoreBrowseCategoryRowCard
                      key={item.key}
                      data={browseItemToRowCard(item.store)}
                      locale={ko ? "ko" : "en"}
                      campaignBenefit={campaignBenefit}
                    />
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
