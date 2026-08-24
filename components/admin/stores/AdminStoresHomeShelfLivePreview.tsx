"use client";

/**
 * Admin HOME shelf preview — live `/api/stores/home-feed` + composeLiveHomeFeed
 * for the selected shelf's composerSlot. No fake store/product names.
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

  useEffect(() => {
    let cancelled = false;
    setFeed({ status: "loading" });
    void (async () => {
      try {
        const res = await fetch("/api/stores/home-feed", { credentials: "include", cache: "no-store" });
        const json = (await res.json()) as {
          ok?: boolean;
          stores?: StoreHomeFeedItem[];
          meta?: { compositionPolicy?: Parameters<typeof composeLiveHomeFeed>[1] };
          error?: string;
        };
        if (cancelled) return;
        if (!json.ok || !Array.isArray(json.stores)) {
          setFeed({ status: "error", message: json.error?.trim() || (ko ? "홈 피드를 불러오지 못했습니다." : "Failed to load home feed.") });
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
  }, [ko]);

  const composed = useMemo(() => {
    if (feed.status !== "ready") return null;
    return composeLiveHomeFeed(feed.stores, feed.policyMeta);
  }, [feed]);

  const entity = shelf.productConfig.entityType;
  const showAll = shelf.productConfig.showAllEnabled;
  const title = shelf.titleKo;
  const subtitle = shelf.subtitleKo;

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
    const max = shelf.max;
    if (bucket.kind === "food") {
      const items = cap(bucket.items, max);
      if (items.length === 0) {
        return (
          <p className="px-2 py-6 text-center text-[12px] text-sam-muted">
            {ko ? "이 선반 슬롯에 노출할 상품이 없습니다." : "No products in this shelf slot."}
          </p>
        );
      }
      if (shelf.presentation === "editorial_grid") {
        return (
          <div className="grid grid-cols-2 gap-2">
            {items.slice(0, 4).map((item) => (
              <div key={`${item.storeId}-${item.productId}`} className="overflow-hidden rounded-ui-rect border border-sam-border">
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
      return (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {items.map((item) => (
            <div
              key={`${item.storeId}-${item.productId}`}
              className="w-[7.5rem] shrink-0 overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface"
            >
              <div
                className="aspect-square bg-sam-surface-muted bg-cover bg-center"
                style={item.imageUrl ? { backgroundImage: `url(${item.imageUrl})` } : undefined}
              />
              <div className="space-y-0.5 p-2">
                <p className="truncate text-[12px] font-semibold">{item.name}</p>
                <p className="truncate text-[10px] text-sam-muted">{item.storeName}</p>
                <p className="text-[11px] font-bold text-emerald-700">₱{item.price}</p>
              </div>
            </div>
          ))}
        </div>
      );
    }

    const stores = cap(bucket.items, max);
    if (stores.length === 0) {
      return (
        <p className="px-2 py-6 text-center text-[12px] text-sam-muted">
          {ko ? "이 선반 슬롯에 노출할 매장이 없습니다." : "No stores in this shelf slot."}
        </p>
      );
    }

    if (entity === "brand" || shelf.presentation === "brand_circular") {
      return (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {stores.map((store) => (
            <div key={store.id} className="flex w-16 shrink-0 flex-col items-center gap-1">
              <div
                className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-emerald-50 text-[9px] font-semibold text-emerald-700 ring-1 ring-sam-border bg-cover bg-center"
                style={store.profileImageUrl ? { backgroundImage: `url(${store.profileImageUrl})` } : undefined}
                title={store.nameKo}
              >
                {!store.profileImageUrl ? store.nameKo.slice(0, 2) : null}
              </div>
              <p className="w-full truncate text-center text-[10px] font-medium">{store.nameKo}</p>
            </div>
          ))}
        </div>
      );
    }

    if (shelf.presentation === "timesale_vertical") {
      return (
        <div className="space-y-2">
          {stores.map((store) => (
            <div key={store.id} className="flex gap-2.5 border-b border-sam-border/60 pb-2 last:border-0">
              <div
                className="h-[71px] w-[75px] shrink-0 rounded-[6px] bg-sam-surface-muted bg-cover bg-center"
                style={
                  store.profileImageUrl || store.featuredItems[0]?.imageUrl
                    ? {
                        backgroundImage: `url(${store.profileImageUrl || store.featuredItems[0]?.imageUrl})`,
                      }
                    : undefined
                }
              />
              <div className="min-w-0 flex-1 space-y-1 pt-0.5">
                <p className="truncate text-[13px] font-semibold">{store.nameKo}</p>
                <p className="text-[12px] text-sam-muted">
                  ★ {store.rating.toFixed(1)} · {store.etaLabel}
                </p>
                <p className="text-[12px] text-sam-muted">
                  {store.deliveryFeeStrikePhp != null ? (
                    <span className="mr-1 line-through opacity-60">₱{store.deliveryFeeStrikePhp}</span>
                  ) : null}
                  <span className="font-semibold text-emerald-700">{store.deliveryFeeLabel ?? "—"}</span>
                </p>
              </div>
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="flex gap-2 overflow-x-auto pb-1">
        {stores.map((store) => (
          <div
            key={store.id}
            className="w-[9.5rem] shrink-0 overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface"
          >
            <div
              className="relative aspect-[4/3] bg-sam-surface-muted bg-cover bg-center"
              style={
                store.profileImageUrl || store.featuredItems[0]?.imageUrl
                  ? {
                      backgroundImage: `url(${store.profileImageUrl || store.featuredItems[0]?.imageUrl})`,
                    }
                  : undefined
              }
            >
              {shelf.couponIntegration !== "off" ? (
                <span className="absolute left-1.5 top-1.5 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                  {t("store_badge_coupon")}
                </span>
              ) : null}
              {shelf.adIntegration !== "off" ? (
                <span className="absolute right-1.5 top-1.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                  {t("store_insertion_sponsored")}
                </span>
              ) : null}
            </div>
            <div className="space-y-0.5 p-2">
              <p className="line-clamp-2 text-[12px] font-semibold leading-tight">{store.nameKo}</p>
              <p className="text-[11px] text-sam-muted">
                ★ {store.rating.toFixed(1)} · {store.etaLabel}
              </p>
              <p className="text-[11px] font-medium text-emerald-700">{store.deliveryFeeLabel ?? "—"}</p>
            </div>
          </div>
        ))}
      </div>
    );
  }, [shelf, feed, composed, entity, ko, t]);

  return (
    <div
      className="rounded-ui-rect border border-sam-border bg-white p-3 shadow-sm"
      data-admin-home-shelf-preview={shelf.shelfId}
      data-preview-live="true"
      data-preview-entity={entity}
      data-preview-presentation={shelf.presentation}
      data-preview-slot={shelf.composerSlot ?? ""}
    >
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
        {ko ? "실데이터 미리보기 · HOME 선반" : "Live preview · HOME shelf"}
      </p>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-bold text-sam-fg">{title}</p>
          {subtitle ? <p className="truncate text-[12px] text-sam-muted">{subtitle}</p> : null}
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
