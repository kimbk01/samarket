"use client";

/**
 * Admin HOME shelf preview — live home-feed + draft overlay + customer card components.
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
import { StoresHomeFoodCard } from "@/components/stores/home/hub/StoresHomeFoodCard";
import { StoresHomeHighRatingFoodCard } from "@/components/stores/home/presentation/StoresHomeHighRatingFoodCard";
import { StoresHomeBrandCircularCard } from "@/components/stores/home/presentation/StoresHomeBrandCircularCard";
import { StoresHomeStoreHorizontalCard } from "@/components/stores/home/presentation/StoresHomeStoreHorizontalCard";
import { StoresHomeStoreTeaserCard } from "@/components/stores/home/presentation/StoresHomeStoreTeaserCard";
import { StoresHomeTimesaleRowCardList } from "@/components/stores/home/presentation/StoresHomeTimesaleRowCard";
import type { StoresHomeShelfResolvedConfig } from "@/lib/stores/product/stores-home-shelf-product-resolve";
import { defaultDataSourceForSlot } from "@/lib/stores/product/stores-home-data-source";
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
    const saved =
      (feed.policyMeta as { shelfProduct?: { shelves?: StoresHomeShelfResolvedConfig[] } } | null | undefined)
        ?.shelfProduct?.shelves;
    const dataSource =
      shelf.productConfig.dataSource ?? defaultDataSourceForSlot(shelf.composerSlot);
    const overlaid = saved?.map((row) =>
      row.shelfId === shelf.shelfId
        ? {
            ...row,
            enabled: shelf.enabled,
            presentation: shelf.presentation,
            max: shelf.max,
            dataSource,
            productConfig: { ...row.productConfig, ...shelf.productConfig, dataSource },
          }
        : row
    );
    return composeLiveHomeFeed(feed.stores, feed.policyMeta, overlaid);
  }, [feed, shelf]);

  const presentation = shelf.presentation;
  const showAll = shelf.productConfig.showAllEnabled;

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
    if (presentation === "timesale_vertical" && bucket.kind === "store") {
      const stores = cap(bucket.items, shelf.max);
      if (stores.length === 0) {
        return (
          <p className="px-2 py-6 text-center text-[12px] text-sam-muted">
            {ko ? "이 선반 슬롯에 노출할 항목이 없습니다." : "No items in this shelf slot."}
          </p>
        );
      }
      return (
        <div data-preview-presentation="timesale_vertical">
          <StoresHomeTimesaleRowCardList
            stores={stores}
            locale={ko ? "ko" : "en"}
            registerListItem={() => {}}
          />
        </div>
      );
    }

    const entries =
      bucket.kind === "food" ? cap(bucket.items, shelf.max) : cap(bucket.items, shelf.max).map(storeHomeFeedItemToShelfEntry);
    if (entries.length === 0) {
      return (
        <p className="px-2 py-6 text-center text-[12px] text-sam-muted">
          {ko ? "이 선반 슬롯에 노출할 항목이 없습니다." : "No items in this shelf slot."}
        </p>
      );
    }

    const Card =
      presentation === "high_rating_horizontal"
        ? StoresHomeHighRatingFoodCard
        : presentation === "brand_circular"
          ? StoresHomeBrandCircularCard
          : presentation === "store_teaser_horizontal"
            ? StoresHomeStoreTeaserCard
            : presentation === "store_horizontal"
              ? StoresHomeStoreHorizontalCard
              : StoresHomeFoodCard;

    return (
      <div className="flex gap-2 overflow-x-auto pb-1" data-preview-presentation={presentation}>
        {entries.map((item) => (
          <Card key={`${item.storeId}-${item.productId}`} entry={item} imageUrl={item.imageUrl} loadingImage={false} />
        ))}
      </div>
    );
  }, [shelf, feed, composed, presentation, ko]);

  return (
    <div
      className="rounded-ui-rect border border-sam-border bg-white p-3 shadow-sm"
      data-admin-home-shelf-preview={shelf.shelfId}
      data-preview-live="true"
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
          ? `표현: ${presentation} · 데이터: ${shelf.productConfig.dataSource ?? ""} (초안 overlay · 고객 카드)`
          : `Presentation: ${presentation} · data: ${shelf.productConfig.dataSource ?? ""} (draft overlay · customer cards)`}
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
