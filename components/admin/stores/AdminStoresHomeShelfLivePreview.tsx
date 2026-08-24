"use client";

/**
 * Admin HOME shelf preview — live `/api/stores/home-feed` data shaped by
 * the **draft** shelf presentation/entity (same patterns as customer HOME).
 */

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { composeLiveHomeFeed } from "@/lib/stores/composition/stores-composition-live";
import type { StoresHomeCompositionSlotKey } from "@/lib/stores/composition/stores-composition-home-slots";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import type { StoresHomeFoodEntry } from "@/lib/stores/stores-home-feed-sections";
import type { StoresHomeShelfProductConfig } from "@/lib/stores/product/stores-home-shelf-product-config";
import type { StoresHomePresentationPatternId } from "@/lib/stores/presentation/stores-home-presentation-spec";
import type {
  StoresHomeShelfAdIntegration,
  StoresHomeShelfCouponIntegration,
} from "@/lib/stores/product/stores-home-shelf-product-catalog";
import { storeHomeFeedItemToShelfEntry } from "@/lib/stores/product/stores-home-store-to-shelf-entry";

export type AdminHomeShelfPreviewInput = {
  shelfId: string;
  composerSlot: StoresHomeCompositionSlotKey | null;
  enabled: boolean;
  titleKo: string;
  subtitleKo: string | null;
  presentation: StoresHomePresentationPatternId;
  max: number | null;
  couponIntegration: StoresHomeShelfCouponIntegration;
  adIntegration: StoresHomeShelfAdIntegration;
  productConfig: StoresHomeShelfProductConfig;
};

type FeedState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; stores: StoreHomeFeedItem[]; policyMeta: Parameters<typeof composeLiveHomeFeed>[1] };

function slotEntries(
  slot: StoresHomeCompositionSlotKey,
  composed: ReturnType<typeof composeLiveHomeFeed>
): { kind: "food"; items: StoresHomeFoodEntry[] } | { kind: "store"; items: StoreHomeFeedItem[] } {
  switch (slot) {
    case "slot0Food":
      return { kind: "food", items: composed.slot0Food };
    case "slot2Food":
      return { kind: "food", items: composed.slot2Food };
    case "slot3Food":
      return { kind: "food", items: composed.slot3Food };
    case "slot4Food":
      return { kind: "food", items: composed.slot4Food };
    case "slot5Food":
      return { kind: "food", items: composed.slot5Food };
    case "newStoreFood":
      return { kind: "food", items: composed.newStoreFood };
    case "campaignFood":
      return { kind: "food", items: composed.campaignFood };
    case "slot1Stores":
      return { kind: "store", items: composed.slot1Stores };
    case "slot6NearbyStores":
      return { kind: "store", items: composed.slot6NearbyStores };
    case "slot6RestStores":
      return { kind: "store", items: composed.slot6RestStores };
    default:
      return { kind: "store", items: [] };
  }
}

function cap<T>(items: readonly T[], max: number | null): T[] {
  if (max == null || max < 0) return [...items];
  return items.slice(0, max);
}

function toPreviewEntries(
  bucket: { kind: "food"; items: StoresHomeFoodEntry[] } | { kind: "store"; items: StoreHomeFeedItem[] },
  max: number | null
): StoresHomeFoodEntry[] {
  if (bucket.kind === "food") return cap(bucket.items, max);
  return cap(bucket.items, max).map(storeHomeFeedItemToShelfEntry);
}

function BadgeOverlays({
  coupon,
  ad,
  couponLabel,
  adLabel,
}: {
  coupon: boolean;
  ad: boolean;
  couponLabel: string;
  adLabel: string;
}) {
  return (
    <>
      {coupon ? (
        <span className="absolute left-1.5 top-1.5 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[9px] font-semibold text-white">
          {couponLabel}
        </span>
      ) : null}
      {ad ? (
        <span className="absolute right-1.5 top-1.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-[9px] font-semibold text-white">
          {adLabel}
        </span>
      ) : null}
    </>
  );
}

export function AdminStoresHomeShelfLivePreview({ shelf }: { shelf: AdminHomeShelfPreviewInput }) {
  const { t, language } = useI18n();
  const ko = language === "ko";
  const [feed, setFeed] = useState<FeedState>({ status: "loading" });
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setFeed({ status: "loading" });
    void (async () => {
      try {
        const res = await fetch("/api/stores/home-feed?fresh=1", {
          credentials: "include",
          cache: "no-store",
        });
        const json = (await res.json()) as {
          ok?: boolean;
          stores?: StoreHomeFeedItem[];
          meta?: { compositionPolicy?: Parameters<typeof composeLiveHomeFeed>[1] };
          error?: string;
        };
        if (cancelled) return;
        if (!json.ok || !Array.isArray(json.stores)) {
          setFeed({
            status: "error",
            message: json.error?.trim() || (ko ? "홈 피드를 불러오지 못했습니다." : "Failed to load home feed."),
          });
          return;
        }
        setFeed({
          status: "ready",
          stores: json.stores,
          policyMeta: json.meta?.compositionPolicy ?? null,
        });
      } catch (e) {
        if (cancelled) return;
        setFeed({
          status: "error",
          message: e instanceof Error ? e.message : ko ? "홈 피드 오류" : "Home feed error",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ko, reloadTick]);

  const composed = useMemo(() => {
    if (feed.status !== "ready") return null;
    return composeLiveHomeFeed(feed.stores, feed.policyMeta);
  }, [feed]);

  const entity = shelf.productConfig.entityType;
  const presentation = shelf.presentation;
  const showAll = shelf.productConfig.showAllEnabled;
  const showCoupon = shelf.couponIntegration !== "off";
  const showAd = shelf.adIntegration !== "off";

  const body = useMemo(() => {
    if (!shelf.enabled) {
      return (
        <p className="rounded-ui-rect bg-sam-surface-muted px-3 py-6 text-center text-[12px] text-sam-muted">
          {ko ? "선반 OFF — 고객 HOME에 이 선반이 노출되지 않습니다." : "Shelf OFF — not shown on customer HOME."}
        </p>
      );
    }
    if (!shelf.composerSlot) {
      return (
        <p className="rounded-ui-rect bg-amber-50 px-3 py-6 text-center text-[12px] text-amber-800">
          {ko ? "composerSlot 없음 — 고객 선반에 연결되지 않습니다." : "No composerSlot — not wired to customer HOME."}
        </p>
      );
    }
    if (feed.status === "loading") {
      return <p className="px-2 py-6 text-center text-[12px] text-sam-muted">{ko ? "실데이터 로딩…" : "Loading live data…"}</p>;
    }
    if (feed.status === "error") {
      return <p className="px-2 py-6 text-center text-[12px] text-rose-700">{feed.message}</p>;
    }
    if (!composed) return null;

    const bucket = slotEntries(shelf.composerSlot, composed);
    const entries = toPreviewEntries(bucket, shelf.max);
    if (entries.length === 0) {
      return (
        <p className="px-2 py-6 text-center text-[12px] text-sam-muted">
          {ko ? "이 선반 슬롯에 노출할 항목이 없습니다." : "No items in this shelf slot."}
        </p>
      );
    }

    if (presentation === "brand_circular" || entity === "brand") {
      return (
        <div className="flex gap-3 overflow-x-auto pb-1" data-preview-presentation="brand_circular">
          {entries.map((item) => (
            <div key={`${item.storeId}-${item.productId}`} className="flex w-16 shrink-0 flex-col items-center gap-1">
              <div
                className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-emerald-50 text-[9px] font-semibold text-emerald-700 ring-1 ring-sam-border bg-cover bg-center"
                style={item.imageUrl ? { backgroundImage: `url(${item.imageUrl})` } : undefined}
                title={item.storeName}
              >
                {!item.imageUrl ? item.storeName.slice(0, 2) : null}
              </div>
              <p className="w-full truncate text-center text-[10px] font-medium">{item.storeName}</p>
            </div>
          ))}
        </div>
      );
    }

    if (presentation === "timesale_vertical") {
      return (
        <div className="space-y-2" data-preview-presentation="timesale_vertical">
          {entries.map((item) => (
            <div
              key={`${item.storeId}-${item.productId}`}
              className="flex gap-2.5 border-b border-sam-border/60 pb-2 last:border-0"
            >
              <div
                className="relative h-[71px] w-[75px] shrink-0 rounded-[6px] bg-sam-surface-muted bg-cover bg-center"
                style={item.imageUrl ? { backgroundImage: `url(${item.imageUrl})` } : undefined}
              >
                <BadgeOverlays
                  coupon={showCoupon}
                  ad={showAd}
                  couponLabel={t("store_badge_coupon")}
                  adLabel={t("store_insertion_sponsored")}
                />
              </div>
              <div className="min-w-0 flex-1 space-y-1 pt-0.5">
                <p className="truncate text-[13px] font-semibold">{item.storeName}</p>
                <p className="text-[12px] text-sam-muted">
                  ★ {item.rating.toFixed(1)}
                  {item.etaLabel ? ` · ${item.etaLabel}` : ""}
                </p>
                <p className="truncate text-[11px] text-sam-muted">{item.name}</p>
                <p className="text-[12px] font-semibold text-emerald-700">
                  {item.deliveryFeeLabel ?? `₱${item.price}`}
                </p>
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (presentation === "editorial_grid") {
      return (
        <div className="grid grid-cols-2 gap-2" data-preview-presentation="editorial_grid">
          {entries.slice(0, 4).map((item) => (
            <div
              key={`${item.storeId}-${item.productId}`}
              className="overflow-hidden rounded-ui-rect border border-sam-border"
            >
              <div
                className="aspect-square bg-sam-surface-muted bg-cover bg-center"
                style={item.imageUrl ? { backgroundImage: `url(${item.imageUrl})` } : undefined}
              />
              <div className="space-y-0.5 p-2">
                <p className="truncate text-[11px] font-semibold">{item.name}</p>
                <p className="text-[10px] text-sam-muted">{item.storeName}</p>
                <p className="text-[11px] font-bold text-emerald-700">₱{item.price}</p>
              </div>
            </div>
          ))}
        </div>
      );
    }

    const cardWidth =
      presentation === "store_teaser_horizontal" || presentation === "store_horizontal"
        ? "w-[9.5rem]"
        : "w-[7.5rem]";
    const showProductName =
      presentation === "food_horizontal" ||
      presentation === "high_rating_horizontal" ||
      entity === "product";

    return (
      <div className="flex gap-2 overflow-x-auto pb-1" data-preview-presentation={presentation}>
        {entries.map((item) => (
          <div
            key={`${item.storeId}-${item.productId}`}
            className={`${cardWidth} shrink-0 overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface`}
          >
            <div
              className={`relative bg-sam-surface-muted bg-cover bg-center ${
                showProductName && presentation === "food_horizontal" ? "aspect-square" : "aspect-[4/3]"
              }`}
              style={item.imageUrl ? { backgroundImage: `url(${item.imageUrl})` } : undefined}
            >
              <BadgeOverlays
                coupon={showCoupon}
                ad={showAd}
                couponLabel={t("store_badge_coupon")}
                adLabel={t("store_insertion_sponsored")}
              />
            </div>
            <div className="space-y-0.5 p-2">
              {showProductName ? (
                <>
                  <p className="truncate text-[12px] font-semibold">{item.name}</p>
                  <p className="truncate text-[10px] text-sam-muted">{item.storeName}</p>
                  <p className="text-[11px] font-bold text-emerald-700">₱{item.price}</p>
                </>
              ) : (
                <>
                  <p className="line-clamp-2 text-[12px] font-semibold leading-tight">{item.storeName}</p>
                  <p className="text-[11px] text-sam-muted">
                    ★ {item.rating.toFixed(1)}
                    {item.etaLabel ? ` · ${item.etaLabel}` : ""}
                  </p>
                  <p className="text-[11px] font-medium text-emerald-700">
                    {item.deliveryFeeLabel ?? "—"}
                  </p>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }, [shelf, feed, composed, entity, presentation, showCoupon, showAd, ko, t]);

  return (
    <div
      className="rounded-ui-rect border border-sam-border bg-white p-3 shadow-sm"
      data-admin-home-shelf-preview={shelf.shelfId}
      data-preview-live="true"
      data-preview-entity={entity}
      data-preview-presentation={presentation}
      data-preview-slot={shelf.composerSlot ?? ""}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
          {ko ? "실데이터 미리보기 · HOME 선반" : "Live preview · HOME shelf"}
        </p>
        <button
          type="button"
          className="text-[10px] font-semibold text-emerald-700 underline"
          onClick={() => setReloadTick((n) => n + 1)}
        >
          {ko ? "새로고침" : "Refresh"}
        </button>
      </div>
      <p className="mb-2 text-[10px] text-sam-muted">
        {ko
          ? `표현: ${presentation} · 유형: ${entity} (초안 즉시 반영 · 저장 후 고객 HOME 동기화)`
          : `Presentation: ${presentation} · entity: ${entity} (draft live · save syncs customer HOME)`}
      </p>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-bold text-sam-fg">{shelf.titleKo}</p>
          {shelf.subtitleKo ? <p className="truncate text-[12px] text-sam-muted">{shelf.subtitleKo}</p> : null}
        </div>
        {showAll ? (
          <span className="shrink-0 text-[12px] font-semibold text-emerald-600">
            {shelf.productConfig.showAllLabelKo?.trim() || t("store_browse_view_all")} ›
          </span>
        ) : null}
      </div>
      {body}
    </div>
  );
}
