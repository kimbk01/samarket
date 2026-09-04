"use client";

/**
 * HOME shelf CMS — operator edit surface.
 * Keeps the existing PUT contract while matching the delivery CMS mockup behavior.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AdminDeliveryCmsChrome } from "@/components/admin/shell/AdminDeliveryCmsChrome";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayDialog, DibayOverlayButton } from "@/components/ui/dibay-overlay";
import { Sam } from "@/lib/ui/sam-component-classes";
import { placementMapFocusHref } from "@/lib/admin/placement-map-read-model";
import type { StoresHomePresentationPatternId } from "@/lib/stores/presentation/stores-home-presentation-spec";
import type {
  StoresHomeShelfAdIntegration,
  StoresHomeShelfCouponIntegration,
} from "@/lib/stores/product/stores-home-shelf-product-catalog";
import {
  resolveHomeShelfShowAllHref,
  type StoresHomeShelfImageSource,
  type StoresHomeShelfShowAllRouteKey,
} from "@/lib/stores/product/stores-home-shelf-product-config";
import {
  coercePresentationForDataSource,
  countHomeDataSourceCandidates,
  diagnoseHomeShelfCustomerHidden,
  presentationsAllowedForDataSource,
  STORES_HOME_DATA_SOURCE_IDS,
  type StoresHomeDataSourceId,
} from "@/lib/stores/product/stores-home-data-source";
import {
  STORES_POPULARITY_WINDOW_DAYS_IDS,
  buildStorePopularityWindowMeta,
  resolvePopularityWindowDays,
} from "@/lib/stores/store-discovery-popular-store";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import type { StoresHomeShelfResolvedConfig } from "@/lib/stores/product/stores-home-shelf-product-resolve";
import { AdminStoresHomeShelfLivePreview } from "@/components/admin/stores/AdminStoresHomeShelfLivePreview";
import { AdminDeliveryAdHomePolicyPanel } from "@/components/admin/stores/AdminDeliveryAdPlacementPolicyPanel";
import { invalidateStoreHomeFeedClientCache } from "@/lib/stores/store-home-feed-client-cache";
import { clearStoresHomeFeedLiveStore } from "@/lib/stores/stores-home-feed-live-store";

type DraftShelf = StoresHomeShelfResolvedConfig & { draftMax: string; draftOrder: string };

type HomeTab = "basic" | "presentation" | "data" | "coupon_ad" | "exposure" | "advanced";
type ModalMode = "add" | "duplicate" | "delete" | null;

const IMAGE_OPTIONS: StoresHomeShelfImageSource[] = [
  "auto",
  "store_profile",
  "representative_product",
  "campaign_creative",
  "brand_logo",
];
const ROUTE_OPTIONS: StoresHomeShelfShowAllRouteKey[] = [
  "none",
  "orderNow",
  "popular",
  "discount",
  "topRated",
  "nearby",
  "recommended",
  "allStores",
];
const COUPON_OPTIONS: StoresHomeShelfCouponIntegration[] = ["off", "badge_on_image", "benefit_line", "both"];
const AD_OPTIONS: StoresHomeShelfAdIntegration[] = ["off", "sponsored_badge", "benefit_line", "both"];

const HOME_TABS: { id: HomeTab; labelKo: string; labelEn: string }[] = [
  { id: "basic", labelKo: "기본 설정", labelEn: "Basic" },
  { id: "presentation", labelKo: "표현 설정", labelEn: "Display" },
  { id: "data", labelKo: "데이터/정책", labelEn: "Data / policy" },
  { id: "coupon_ad", labelKo: "쿠폰/광고", labelEn: "Coupon / Ad" },
  { id: "exposure", labelKo: "노출 설정", labelEn: "Exposure" },
  { id: "advanced", labelKo: "고급 설정", labelEn: "Advanced" },
];

function presentationShort(pres: string, ko: boolean) {
  const map: Record<string, [string, string]> = {
    food_horizontal: ["가로 상품", "Horizontal food"],
    store_horizontal: ["가로 매장", "Horizontal store"],
    timesale_vertical: ["세로형", "Vertical"],
    store_teaser_horizontal: ["티저형", "Teaser"],
    brand_circular: ["원형 브랜드", "Circular brand"],
    high_rating_horizontal: ["평점 가로", "High-rating"],
    editorial_grid: ["그리드", "Grid"],
    preserved_legacy: ["보존 항목", "Preserved legacy"],
  };
  const hit = map[pres];
  return hit ? (ko ? hit[0] : hit[1]) : pres;
}

function integrationLabel(value: StoresHomeShelfCouponIntegration | StoresHomeShelfAdIntegration, ko: boolean) {
  if (value === "off") return ko ? "끄기" : "Off";
  if (value === "badge_on_image") return ko ? "이미지 뱃지" : "Image badge";
  if (value === "sponsored_badge") return ko ? "스폰서 뱃지" : "Sponsored badge";
  if (value === "benefit_line") return ko ? "혜택 문구" : "Benefit line";
  return ko ? "뱃지 + 문구" : "Badge + line";
}

function toDraftShelf(shelf: StoresHomeShelfResolvedConfig): DraftShelf {
  return {
    ...shelf,
    draftMax: shelf.max == null ? "" : String(shelf.max),
    draftOrder: String(shelf.order),
  };
}

function cloneRows(rows: DraftShelf[]): DraftShelf[] {
  return JSON.parse(JSON.stringify(rows)) as DraftShelf[];
}

function maxFromDraft(value: string) {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function orderFromDraft(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeDateTimeLocal(value: string | null) {
  if (!value) return "";
  return value.slice(0, 16);
}

function dateTimeLocalToPayload(value: string) {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-40 ${
        checked ? "bg-emerald-500" : "bg-sam-border"
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
          checked ? "left-4" : "left-0.5"
        }`}
      />
    </button>
  );
}

export function AdminStoresHomeShelvesPage() {
  const { t, language } = useI18n();
  const ko = language === "ko";
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [revision, setRevision] = useState<number | null>(null);
  const [rows, setRows] = useState<DraftShelf[]>([]);
  const [baseline, setBaseline] = useState<DraftShelf[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<HomeTab>("basic");
  const [dragId, setDragId] = useState<string | null>(null);
  const [menuShelfId, setMenuShelfId] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [duplicateSourceId, setDuplicateSourceId] = useState<string | null>(null);
  const [duplicateTargetId, setDuplicateTargetId] = useState<string>("");
  const [addTargetId, setAddTargetId] = useState<string>("");
  const [homeFeedStores, setHomeFeedStores] = useState<StoreHomeFeedItem[]>([]);
  const [popularityOverlayCounts, setPopularityOverlayCounts] = useState<
    Record<string, Record<string, number>>
  >({});
  const [popularityUntilIso, setPopularityUntilIso] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    setToast(null);
    try {
      const res = await fetch("/api/admin/stores-home-shelves", { credentials: "include", cache: "no-store" });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        shelves?: StoresHomeShelfResolvedConfig[];
        revision?: number;
      };
      if (!res.ok || !json.ok || !json.shelves) {
        setErr(json.error ?? "load_fail");
        setRows([]);
        setBaseline([]);
        setRevision(null);
        return;
      }
      const mapped = json.shelves.map(toDraftShelf);
      setRows(mapped);
      setBaseline(cloneRows(mapped));
      setRevision(typeof json.revision === "number" ? json.revision : 0);
      setSelectedId((prev) => {
        if (prev && mapped.some((shelf) => shelf.shelfId === prev && shelf.availability !== "unavailable")) {
          return prev;
        }
        return mapped.find((shelf) => shelf.availability !== "unavailable" && shelf.enabled)?.shelfId
          ?? mapped.find((shelf) => shelf.availability !== "unavailable")?.shelfId
          ?? null;
      });
    } catch {
      setErr("load_fail");
      setRows([]);
      setBaseline([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/stores/home-feed?fresh=1", { credentials: "include", cache: "no-store" });
        const json = (await res.json()) as {
          ok?: boolean;
          stores?: StoreHomeFeedItem[];
          meta?: {
            popularityOverlay?: { untilIso?: string; countsByDays?: Record<string, Record<string, number>> };
            compositionPolicy?: { popularityOverlay?: { untilIso?: string; countsByDays?: Record<string, Record<string, number>> } };
          };
        };
        if (cancelled || !json.ok || !Array.isArray(json.stores)) return;
        setHomeFeedStores(json.stores);
        const overlay =
          json.meta?.popularityOverlay ?? json.meta?.compositionPolicy?.popularityOverlay;
        setPopularityOverlayCounts(overlay?.countsByDays ?? {});
        setPopularityUntilIso(overlay?.untilIso ?? null);
      } catch {
        /* preview still loads independently */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const editableRows = useMemo(
    () =>
      [...rows]
        .filter((row) => row.availability !== "unavailable")
        .sort((a, b) => orderFromDraft(a.draftOrder, a.order) - orderFromDraft(b.draftOrder, b.order)),
    [rows]
  );
  const disabledAvailableRows = useMemo(
    () => editableRows.filter((row) => !row.enabled),
    [editableRows]
  );
  const unavailableRows = useMemo(
    () => rows.filter((row) => row.availability === "unavailable").sort((a, b) => a.order - b.order),
    [rows]
  );
  const selected = rows.find((shelf) => shelf.shelfId === selectedId) ?? null;
  const selectedEditable = selected && selected.availability !== "unavailable" ? selected : null;
  const duplicateSource = rows.find((shelf) => shelf.shelfId === duplicateSourceId) ?? selectedEditable;
  const duplicateTargets = editableRows.filter((row) => row.shelfId !== duplicateSource?.shelfId);
  const showAllHref = selectedEditable
    ? resolveHomeShelfShowAllHref(selectedEditable.productConfig.showAllRouteKey)
    : null;

  const update = (shelfId: string, patch: Partial<DraftShelf>) => {
    setRows((prev) => prev.map((row) => (row.shelfId === shelfId ? { ...row, ...patch } : row)));
  };

  const updateProductConfig = (shelf: DraftShelf, patch: Partial<DraftShelf["productConfig"]>) => {
    update(shelf.shelfId, { productConfig: { ...shelf.productConfig, ...patch } });
  };

  const selectShelf = (shelfId: string, nextTab: HomeTab = "basic") => {
    setSelectedId(shelfId);
    setTab(nextTab);
    setMenuShelfId(null);
  };

  const renumberEditableRows = (ordered: DraftShelf[]) => {
    const orderMap = new Map(ordered.map((row, index) => [row.shelfId, index]));
    setRows((prev) =>
      prev.map((row) => {
        const order = orderMap.get(row.shelfId);
        return order == null ? row : { ...row, order, draftOrder: String(order) };
      })
    );
  };

  const reorder = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const fromIdx = editableRows.findIndex((row) => row.shelfId === fromId);
    const toIdx = editableRows.findIndex((row) => row.shelfId === toId);
    if (fromIdx < 0 || toIdx < 0) return;
    const next = [...editableRows];
    const [moved] = next.splice(fromIdx, 1);
    if (!moved) return;
    const restIdx = next.findIndex((row) => row.composerSlot === "slot6RestStores");
    if (restIdx >= 0 && restIdx !== next.length - 1) {
      const [rest] = next.splice(restIdx, 1);
      if (rest) next.push(rest);
    }
    renumberEditableRows(next);
  };

  const openAddModal = () => {
    setAddTargetId(disabledAvailableRows[0]?.shelfId ?? "");
    setModalMode("add");
  };

  const recoverShelf = (shelfId: string) => {
    if (!shelfId) return;
    update(shelfId, { enabled: true });
    selectShelf(shelfId);
    setModalMode(null);
    setToast(ko ? "선반을 활성 목록에 복구했습니다." : "Shelf restored to the active list.");
  };

  const openDuplicateModal = (sourceId: string) => {
    const firstTarget = editableRows.find((row) => row.shelfId !== sourceId)?.shelfId ?? "";
    setDuplicateSourceId(sourceId);
    setDuplicateTargetId(firstTarget);
    setModalMode("duplicate");
    setMenuShelfId(null);
  };

  const applyDuplicate = () => {
    if (!duplicateSource || !duplicateTargetId) return;
    const source = duplicateSource;
    setRows((prev) =>
      prev.map((row) =>
        row.shelfId === duplicateTargetId
          ? {
              ...row,
              titleKo: source.titleKo,
              titleEn: source.titleEn,
              subtitleKo: source.subtitleKo,
              subtitleEn: source.subtitleEn,
              presentation: source.presentation,
              couponIntegration: source.couponIntegration,
              adIntegration: source.adIntegration,
              max: maxFromDraft(source.draftMax),
              draftMax: source.draftMax,
              productConfig: {
                ...row.productConfig,
                entityType: source.productConfig.entityType,
                showAllEnabled: source.productConfig.showAllEnabled,
                showAllLabelKo: source.productConfig.showAllLabelKo,
                showAllLabelEn: source.productConfig.showAllLabelEn,
                showAllRouteKey: source.productConfig.showAllRouteKey,
                imageSource: source.productConfig.imageSource,
                operatorMemo: source.productConfig.operatorMemo,
                dataSource: source.productConfig.dataSource ?? source.dataSource,
              },
              dataSource: source.dataSource,
            }
          : row
      )
    );
    selectShelf(duplicateTargetId);
    setModalMode(null);
    setToast(ko ? "선반 설정을 복제했습니다." : "Shelf settings copied.");
  };

  const disableSelected = () => {
    if (!selectedEditable) return;
    update(selectedEditable.shelfId, { enabled: false });
    setModalMode(null);
    setToast(ko ? "선반을 사용안함으로 변경했습니다." : "Shelf disabled.");
  };

  const onCancel = () => {
    setRows(cloneRows(baseline));
    setSaveErr(null);
    setToast(ko ? "변경사항을 취소했습니다." : "Changes reverted.");
  };

  const onSave = async () => {
    setSaving(true);
    setToast(null);
    setSaveErr(null);
    try {
      if (revision == null) {
        setSaveErr("save_fail");
        return;
      }
      const editable = rows.filter((row) => row.availability !== "unavailable");
      const res = await fetch("/api/admin/stores-home-shelves", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedRevision: revision,
          shelves: editable.map((row) => ({
            shelfId: row.shelfId,
            enabled: row.enabled,
            order: orderFromDraft(row.draftOrder, row.order),
            max: maxFromDraft(row.draftMax),
            titleKo: row.titleKo,
            titleEn: row.titleEn,
            subtitleKo: row.subtitleKo,
            subtitleEn: row.subtitleEn,
            presentation: row.presentation,
            couponIntegration: row.couponIntegration,
            adIntegration: row.adIntegration,
            scheduleStart: row.scheduleStart,
            scheduleEnd: row.scheduleEnd,
            productConfig: row.productConfig,
          })),
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; revision?: number };
      if (!res.ok || !json.ok) {
        setSaveErr(json.error === "stale_revision" ? "stale_revision" : (json.error ?? "save_fail"));
        return;
      }
      if (typeof json.revision === "number") setRevision(json.revision);
      setToast(t("admin_stores_home_shelves_save_ok"));
      invalidateStoreHomeFeedClientCache("");
      clearStoresHomeFeedLiveStore();
      await load();
    } catch {
      setSaveErr("save_fail");
    } finally {
      setSaving(false);
    }
  };

  const renderPresentationSelect = (shelf: DraftShelf) => {
    const allowed = presentationsAllowedForDataSource(shelf.dataSource);
    const value = allowed.includes(shelf.presentation) ? shelf.presentation : allowed[0]!;
    return (
    <label className="block text-[12px] font-medium text-sam-muted">
      {ko ? "카드 표현 방식" : "Card presentation"}
      <select
        className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-[13px]"
        value={value}
        onChange={(e) => update(shelf.shelfId, { presentation: e.target.value as StoresHomePresentationPatternId })}
      >
        {allowed.map((option) => (
          <option key={option} value={option}>
            {t(`admin_stores_home_shelves_pres_${option}`)}
          </option>
        ))}
      </select>
    </label>
    );
  };

  const renderPopularityWindowSelect = (shelf: DraftShelf) => {
    if (shelf.dataSource !== "popular_menu") {
      return (
        <p className="text-[12px] text-sam-muted">{t("admin_stores_popularity_window_na")}</p>
      );
    }
    const days = resolvePopularityWindowDays(shelf.productConfig.popularityWindowDays);
    const now = popularityUntilIso ? new Date(popularityUntilIso) : new Date();
    const meta = buildStorePopularityWindowMeta(days, now);
    return (
      <div className="space-y-2 rounded-ui-rect border border-sam-border p-3">
        <label className="block text-[12px] font-medium text-sam-muted">
          {t("admin_stores_popularity_window")}
          <select
            className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-[13px]"
            value={days}
            onChange={(e) =>
              updateProductConfig(shelf, {
                popularityWindowDays: resolvePopularityWindowDays(Number(e.target.value)),
              })
            }
          >
            {STORES_POPULARITY_WINDOW_DAYS_IDS.map((option) => (
              <option key={option} value={option}>
                {t(`admin_stores_popularity_window_${option}`)}
              </option>
            ))}
          </select>
        </label>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
          <dt className="text-sam-muted">{ko ? "집계 기준" : "Window"}</dt>
          <dd>{t(`admin_stores_popularity_window_${days}`)}</dd>
          <dt className="text-sam-muted">{ko ? "방식" : "Mode"}</dt>
          <dd>{t("admin_stores_popularity_rolling")}</dd>
          <dt className="text-sam-muted">Timezone</dt>
          <dd>{t("admin_stores_popularity_tz")}</dd>
          <dt className="text-sam-muted">{ko ? "지표" : "Metric"}</dt>
          <dd>{t("admin_stores_popularity_metric")}</dd>
          <dt className="text-sam-muted">{ko ? "기준 컬럼" : "Column"}</dt>
          <dd className="font-mono">{t("admin_stores_popularity_column")}</dd>
          <dt className="text-sam-muted">{t("admin_stores_popularity_range")}</dt>
          <dd className="col-span-1 break-all">
            {meta.popularitySinceIso} ~ {meta.popularityUntilIso}
          </dd>
        </dl>
        <p className="text-[11px] leading-snug text-sam-muted">{t("admin_stores_popularity_window_limitation")}</p>
      </div>
    );
  };

  const renderDataSourceSelect = (shelf: DraftShelf) => (
    <label className="block text-[12px] font-medium text-sam-muted">
      {ko ? "데이터 소스" : "Data source"}
      <select
        className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-[13px]"
        value={shelf.dataSource}
        onChange={(e) => {
          const dataSource = e.target.value as StoresHomeDataSourceId;
          const presentation = coercePresentationForDataSource(dataSource, shelf.presentation);
          update(shelf.shelfId, {
            dataSource,
            presentation,
            productConfig: { ...shelf.productConfig, dataSource },
          });
        }}
      >
        {STORES_HOME_DATA_SOURCE_IDS.map((option) => (
          <option key={option} value={option}>
            {t(`admin_stores_home_ds_${option}`)}
          </option>
        ))}
      </select>
    </label>
  );

  const renderImageSource = (shelf: DraftShelf) => (
    <label className="block text-[12px] font-medium text-sam-muted">
      {ko ? "적용 이미지 소스" : "Image source"}
      <select
        className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-[13px]"
        value={shelf.productConfig.imageSource}
        onChange={(e) => updateProductConfig(shelf, { imageSource: e.target.value as StoresHomeShelfImageSource })}
      >
        {IMAGE_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {t(`admin_stores_home_shelves_image_${option}`)}
          </option>
        ))}
      </select>
    </label>
  );

  const renderMaxInput = (shelf: DraftShelf) => (
    <label className="block text-[12px] font-medium text-sam-muted">
      {ko ? "최대 노출 개수" : "Max items"}
      <input
        type="number"
        min={0}
        className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-[13px]"
        value={shelf.draftMax}
        onChange={(e) => update(shelf.shelfId, { draftMax: e.target.value })}
      />
    </label>
  );

  const renderEnabledToggle = (shelf: DraftShelf) => (
    <div className="flex items-center justify-between rounded-ui-rect border border-sam-border px-3 py-2">
      <span className="text-[13px] font-medium">{ko ? "선반 사용 여부" : "Shelf enabled"}</span>
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-sam-muted">{shelf.enabled ? (ko ? "사용 중" : "On") : ko ? "끄기" : "Off"}</span>
        <Toggle checked={shelf.enabled} onChange={(value) => update(shelf.shelfId, { enabled: value })} />
      </div>
    </div>
  );

  const renderShowAllBlock = (shelf: DraftShelf) => (
    <div className="rounded-ui-rect border border-sam-border p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[13px] font-semibold">{ko ? "전체보기 설정" : "Show all"}</span>
        <Toggle
          checked={shelf.productConfig.showAllEnabled}
          onChange={(value) => updateProductConfig(shelf, { showAllEnabled: value })}
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-[11px] font-medium text-sam-muted">
          {ko ? "버튼 문구 (KO)" : "Label (KO)"}
          <input
            disabled={!shelf.productConfig.showAllEnabled}
            className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-[13px] disabled:opacity-50"
            value={shelf.productConfig.showAllLabelKo ?? ""}
            onChange={(e) => updateProductConfig(shelf, { showAllLabelKo: e.target.value || null })}
          />
        </label>
        <label className="block text-[11px] font-medium text-sam-muted">
          {ko ? "버튼 문구 (EN)" : "Label (EN)"}
          <input
            disabled={!shelf.productConfig.showAllEnabled}
            className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-[13px] disabled:opacity-50"
            value={shelf.productConfig.showAllLabelEn ?? ""}
            onChange={(e) => updateProductConfig(shelf, { showAllLabelEn: e.target.value || null })}
          />
        </label>
      </div>
      <select
        disabled={!shelf.productConfig.showAllEnabled}
        className="mt-2 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-[13px] disabled:opacity-50"
        value={shelf.productConfig.showAllRouteKey}
        onChange={(e) => updateProductConfig(shelf, { showAllRouteKey: e.target.value as StoresHomeShelfShowAllRouteKey })}
      >
        {ROUTE_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {t(`admin_stores_home_shelves_route_${option}`)}
          </option>
        ))}
      </select>
      {showAllHref ? <p className="mt-1.5 font-mono text-[11px] text-sam-muted">{showAllHref}</p> : null}
    </div>
  );

  const renderTabContent = (shelf: DraftShelf) => {
    if (tab === "basic") {
      return (
        <div className="space-y-3">
          <label className="block text-[12px] font-medium text-sam-muted">
            {ko ? "선반 제목" : "Shelf title"}
            <input
              maxLength={20}
              className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-[13px] text-sam-fg"
              value={shelf.titleKo}
              onChange={(e) => update(shelf.shelfId, { titleKo: e.target.value })}
            />
            <span className="mt-0.5 block text-right text-[10px]">{shelf.titleKo.length}/20</span>
          </label>
          <label className="block text-[12px] font-medium text-sam-muted">
            {ko ? "부제목 (선택)" : "Subtitle (optional)"}
            <input
              maxLength={40}
              className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-[13px] text-sam-fg"
              value={shelf.subtitleKo ?? ""}
              onChange={(e) => update(shelf.shelfId, { subtitleKo: e.target.value || null })}
            />
            <span className="mt-0.5 block text-right text-[10px]">{(shelf.subtitleKo ?? "").length}/40</span>
          </label>
          {renderDataSourceSelect(shelf)}
          {renderPopularityWindowSelect(shelf)}
          {renderPresentationSelect(shelf)}
          {renderMaxInput(shelf)}
          {renderEnabledToggle(shelf)}
          {renderShowAllBlock(shelf)}
        </div>
      );
    }

    if (tab === "presentation") {
      return (
        <div className="space-y-3">
          {renderPresentationSelect(shelf)}
          {renderDataSourceSelect(shelf)}
          {renderPopularityWindowSelect(shelf)}
          {renderImageSource(shelf)}
        </div>
      );
    }

    if (tab === "data") {
      return (
        <div className="space-y-3">
          <p className="rounded-ui-rect bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
            {t("admin_stores_home_shelves_ranking_lock")}
          </p>
          <label className="block text-[12px] font-medium text-sam-muted">
            {ko ? "제목 (English)" : "Title (English)"}
            <input
              maxLength={40}
              className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-[13px]"
              value={shelf.titleEn}
              onChange={(e) => update(shelf.shelfId, { titleEn: e.target.value })}
            />
          </label>
          <label className="block text-[12px] font-medium text-sam-muted">
            {ko ? "부제목 (English)" : "Subtitle (English)"}
            <input
              maxLength={80}
              className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-[13px]"
              value={shelf.subtitleEn ?? ""}
              onChange={(e) => update(shelf.shelfId, { subtitleEn: e.target.value || null })}
            />
          </label>
          {renderImageSource(shelf)}
        </div>
      );
    }

    if (tab === "coupon_ad") {
      const isRestList =
        shelf.shelfId === "rest_stores" || shelf.dataSource === "rest_stores";
      return (
        <div className="space-y-3">
          {isRestList ? (
            <AdminDeliveryAdHomePolicyPanel restShelfAdIntegration={shelf.adIntegration} />
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-[12px] font-medium text-sam-muted">
            {t("admin_stores_home_shelves_col_coupon")}
            <select
              disabled={!shelf.supportsCouponIntegration}
              className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-[13px] disabled:opacity-50"
              value={shelf.couponIntegration}
              onChange={(e) => update(shelf.shelfId, { couponIntegration: e.target.value as StoresHomeShelfCouponIntegration })}
            >
              {COUPON_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {integrationLabel(option, ko)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[12px] font-medium text-sam-muted">
            {t("admin_stores_home_shelves_col_ad")}
            <select
              disabled={!shelf.supportsAdIntegration}
              className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-[13px] disabled:opacity-50"
              value={shelf.adIntegration}
              onChange={(e) => update(shelf.shelfId, { adIntegration: e.target.value as StoresHomeShelfAdIntegration })}
            >
              {AD_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {integrationLabel(option, ko)}
                </option>
              ))}
            </select>
          </label>
          </div>
        </div>
      );
    }

    if (tab === "exposure") {
      return (
        <div className="space-y-3">
          {renderEnabledToggle(shelf)}
          {renderMaxInput(shelf)}
          <label className="block text-[12px] font-medium text-sam-muted">
            {ko ? "노출 순서" : "Order"}
            <input
              type="number"
              min={0}
              className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-[13px]"
              value={shelf.draftOrder}
              onChange={(e) => update(shelf.shelfId, { draftOrder: e.target.value })}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-[12px] font-medium text-sam-muted">
              {ko ? "노출 시작" : "Schedule start"}
              <input
                type="datetime-local"
                className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-[13px]"
                value={normalizeDateTimeLocal(shelf.scheduleStart)}
                onChange={(e) => update(shelf.shelfId, { scheduleStart: dateTimeLocalToPayload(e.target.value) })}
              />
            </label>
            <label className="block text-[12px] font-medium text-sam-muted">
              {ko ? "노출 종료" : "Schedule end"}
              <input
                type="datetime-local"
                className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-[13px]"
                value={normalizeDateTimeLocal(shelf.scheduleEnd)}
                onChange={(e) => update(shelf.shelfId, { scheduleEnd: dateTimeLocalToPayload(e.target.value) })}
              />
            </label>
          </div>
        </div>
      );
    }

    return (
      <label className="block text-[12px] font-medium text-sam-muted">
        {ko ? "운영 메모" : "Operator memo"}
        <textarea
          maxLength={200}
          rows={7}
          className="mt-1 w-full resize-none rounded-ui-rect border border-sam-border px-3 py-2 text-[13px]"
          value={shelf.productConfig.operatorMemo ?? ""}
          onChange={(e) => updateProductConfig(shelf, { operatorMemo: e.target.value || null })}
        />
        <span className="mt-0.5 block text-right text-[10px]">{(shelf.productConfig.operatorMemo ?? "").length}/200</span>
      </label>
    );
  };

  return (
    <AdminDeliveryCmsChrome help="home">
      <div className="space-y-3" data-admin-home-cms="mockup-v3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-[12px] text-sam-muted">{ko ? "배달 › HOME 관리" : "Delivery › HOME management"}</p>
            <h1 className="text-[20px] font-bold text-sam-fg">{t("admin_stores_home_shelves_title")}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/delivery-ads"
              className={Sam.btn.secondary}
              data-admin-delivery-ads-ops-cross-link="1"
            >
              {ko ? "광고 운영 보기" : "View ads operations"}
            </Link>
            <Link
              href={placementMapFocusHref("STORES_HOME_FEED")}
              className={Sam.btn.secondary}
              data-admin-home-placement-map-link="1"
            >
              {ko ? "앱에서 위치 보기" : "View in app map"}
            </Link>
            <button type="button" className={Sam.btn.secondary} onClick={() => void load()} disabled={loading}>
              {t("admin_stores_home_shelves_reload")}
            </button>
          </div>
        </div>

        {toast ? <p className="text-[13px] text-emerald-700">{toast}</p> : null}
        {saveErr ? (
          <p className="text-[13px] text-red-700">
            {saveErr === "stale_revision"
              ? t("admin_stores_home_shelves_stale_revision")
              : t("admin_stores_home_shelves_save_fail")}
          </p>
        ) : null}
        {err ? <p className="text-[13px] text-red-700">{t("admin_stores_home_shelves_save_fail")} ({err})</p> : null}

        {loading ? (
          <p className="text-[13px] text-sam-muted">{t("admin_stores_home_shelves_loading")}</p>
        ) : (
          <div className="grid gap-4 xl:grid-cols-[minmax(300px,340px)_minmax(0,1fr)]">
            <aside className="rounded-ui-rect border border-sam-border bg-white">
              <div className="flex items-center justify-between gap-2 border-b border-sam-border px-3 py-2.5">
                <div>
                  <p className="text-[13px] font-bold text-sam-fg">{ko ? "HOME 선반 목록" : "HOME shelf list"}</p>
                  <p className="text-[11px] text-sam-muted">{ko ? "드래그하여 순서를 변경하세요" : "Drag to change order"}</p>
                </div>
                <button
                  type="button"
                  className="rounded-ui-rect bg-emerald-600 px-2.5 py-1.5 text-[12px] font-semibold text-white hover:bg-emerald-700"
                  onClick={openAddModal}
                >
                  {ko ? "+ 선반 추가" : "+ Add shelf"}
                </button>
              </div>

              <ul className="max-h-[70vh] space-y-1 overflow-y-auto p-2">
                {editableRows.map((row, index) => {
                  const active = row.shelfId === selectedId;
                  const name = ko ? row.titleKo : row.titleEn;
                  const typeLine = `${t(`admin_stores_home_ds_${row.dataSource}`)} · ${presentationShort(row.presentation, ko)}`;
                  const windowDays = resolvePopularityWindowDays(row.productConfig.popularityWindowDays);
                  const overlayRec = popularityOverlayCounts[String(windowDays)];
                  const overlayStores =
                    row.dataSource === "popular_menu" && overlayRec
                      ? homeFeedStores.map((store) => ({
                          ...store,
                          completedOrderCount30d: overlayRec[store.id] ?? 0,
                        }))
                      : homeFeedStores;
                  const candidateCount = countHomeDataSourceCandidates(overlayStores, row.dataSource);
                  const diag = diagnoseHomeShelfCustomerHidden({
                    unavailable: row.availability === "unavailable",
                    enabled: row.enabled,
                    scheduleOk: !row.enabled || row.customerVisible,
                    candidateCount,
                    allocatedCount: candidateCount,
                  });
                  const statusLine = diag.customerVisible
                    ? `${ko ? "후보" : "cand"} ${candidateCount} · ${ko ? "고객 노출" : "visible"} YES`
                    : `${ko ? "후보" : "cand"} ${candidateCount} · ${
                        diag.hiddenReason ? t(`admin_stores_home_hidden_${diag.hiddenReason}`) : ""
                      }`;
                  return (
                    <li key={row.shelfId} className="relative">
                      <div
                        draggable
                        onDragStart={() => setDragId(row.shelfId)}
                        onDragOver={(e) => e.preventDefault()}
                        onDragEnd={() => setDragId(null)}
                        onDrop={() => {
                          if (dragId) reorder(dragId, row.shelfId);
                          setDragId(null);
                        }}
                        onClick={() => selectShelf(row.shelfId)}
                        className={`flex cursor-pointer items-center gap-2 rounded-ui-rect px-2 py-2 ${
                          active ? "bg-emerald-50 ring-1 ring-emerald-200" : "hover:bg-sam-surface-muted"
                        } ${row.enabled ? "" : "opacity-70"}`}
                      >
                        <span className="cursor-grab text-sam-muted" aria-hidden>
                          ::
                        </span>
                        <span className="w-5 shrink-0 text-center text-[12px] font-semibold text-sam-muted">{index + 1}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-semibold text-sam-fg">{name}</p>
                          <p className="truncate text-[11px] text-sam-muted">{typeLine}</p>
                          <p className="truncate text-[10px] text-sam-muted">{statusLine}</p>
                        </div>
                        <Toggle checked={row.enabled} onChange={(value) => update(row.shelfId, { enabled: value })} />
                        <button
                          type="button"
                          className="rounded px-1 text-[18px] leading-none text-sam-muted hover:bg-white hover:text-sam-fg"
                          aria-label={ko ? "선반 메뉴" : "Shelf menu"}
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuShelfId((prev) => (prev === row.shelfId ? null : row.shelfId));
                          }}
                        >
                          ⋯
                        </button>
                      </div>
                      {menuShelfId === row.shelfId ? (
                        <div className="absolute right-2 top-9 z-10 w-28 overflow-hidden rounded-ui-rect border border-sam-border bg-white py-1 text-[12px] shadow-lg">
                          <button
                            type="button"
                            className="block w-full px-3 py-2 text-left hover:bg-sam-surface-muted"
                            onClick={() => openDuplicateModal(row.shelfId)}
                          >
                            {ko ? "복제" : "Duplicate"}
                          </button>
                          <button
                            type="button"
                            className="block w-full px-3 py-2 text-left hover:bg-sam-surface-muted"
                            onClick={() => {
                              update(row.shelfId, { enabled: false });
                              setMenuShelfId(null);
                              setToast(ko ? "선반을 사용안함으로 변경했습니다." : "Shelf disabled.");
                            }}
                          >
                            {ko ? "사용안함" : "Disable"}
                          </button>
                          <button
                            type="button"
                            className="block w-full px-3 py-2 text-left hover:bg-sam-surface-muted"
                            onClick={() => selectShelf(row.shelfId)}
                          >
                            {ko ? "선택" : "Select"}
                          </button>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>

              {unavailableRows.length > 0 ? (
                <div className="border-t border-sam-border p-3">
                  <p className="mb-2 text-[11px] font-semibold text-sam-muted">
                    {ko ? "사용 불가 선반 (데이터 authority 없음)" : "Unavailable shelves (missing authority)"}
                  </p>
                  <ul className="space-y-1">
                    {unavailableRows.map((row) => (
                      <li
                        key={row.shelfId}
                        className="rounded-ui-rect bg-sam-surface-muted px-2 py-1.5 text-[12px] text-sam-muted"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate">{ko ? row.titleKo : row.titleEn}</span>
                          <span className="shrink-0 rounded bg-sam-border/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase">
                            UNAVAILABLE
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </aside>

            <section className="overflow-hidden rounded-ui-rect border border-sam-border bg-white">
              {selectedEditable ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sam-border px-4 py-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <h2 className="truncate text-[16px] font-bold text-sam-fg">
                        {ko ? selectedEditable.titleKo : selectedEditable.titleEn}
                      </h2>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          selectedEditable.enabled
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-sam-surface-muted text-sam-muted"
                        }`}
                      >
                        {selectedEditable.enabled ? (ko ? "사용 중" : "Active") : ko ? "비활성" : "Off"}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2 text-[12px]">
                      <button
                        type="button"
                        className={Sam.btn.secondary}
                        onClick={() => previewRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}
                      >
                        {ko ? "미리보기" : "Preview"}
                      </button>
                      <button type="button" className={Sam.btn.secondary} onClick={() => openDuplicateModal(selectedEditable.shelfId)}>
                        {ko ? "복제" : "Duplicate"}
                      </button>
                      <button
                        type="button"
                        className={Sam.btn.secondary}
                        onClick={() => setModalMode("delete")}
                      >
                        {ko ? "삭제" : "Delete"}
                      </button>
                    </div>
                  </div>

                  <div className="flex gap-1 overflow-x-auto border-b border-sam-border px-2 pt-2">
                    {HOME_TABS.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setTab(item.id)}
                        className={`shrink-0 rounded-t-ui-rect px-3 py-2 text-[12px] font-semibold ${
                          tab === item.id
                            ? "bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200"
                            : "text-sam-muted hover:text-sam-fg"
                        }`}
                      >
                        {ko ? item.labelKo : item.labelEn}
                      </button>
                    ))}
                  </div>

                  <div
                    className={`grid gap-4 p-4 ${
                      tab === "basic" || tab === "presentation"
                        ? "lg:grid-cols-[minmax(0,1fr)_minmax(260px,320px)]"
                        : "lg:grid-cols-1"
                    }`}
                  >
                    <div className="space-y-4">{renderTabContent(selectedEditable)}</div>
                    {tab === "basic" || tab === "presentation" ? (
                      <div ref={previewRef} className="space-y-3">
                        <p className="text-[12px] font-bold text-sam-fg">{t("admin_stores_home_shelves_preview_title")}</p>
                        <p className="text-[11px] text-sam-muted">
                          {ko
                            ? "HOME은 선반(composer slot) 위주입니다. 미리보기는 고객 home-feed 실데이터입니다."
                            : "HOME is shelf-led (composer slots). Preview uses live customer home-feed data."}
                        </p>
                        <AdminStoresHomeShelfLivePreview
                          shelf={{
                            shelfId: selectedEditable.shelfId,
                            composerSlot: selectedEditable.composerSlot,
                            enabled: selectedEditable.enabled,
                            titleKo: selectedEditable.titleKo,
                            subtitleKo: selectedEditable.subtitleKo,
                            presentation: selectedEditable.presentation,
                            max: (() => {
                              const raw = selectedEditable.draftMax.trim();
                              if (!raw) return selectedEditable.max;
                              const n = Number(raw);
                              return Number.isFinite(n) ? n : selectedEditable.max;
                            })(),
                            couponIntegration: selectedEditable.couponIntegration,
                            adIntegration: selectedEditable.adIntegration,
                            productConfig: selectedEditable.productConfig,
                          }}
                        />
                      </div>
                    ) : null}
                  </div>

                  <div className="sticky bottom-0 flex justify-end gap-2 border-t border-sam-border bg-white px-4 py-3">
                    <button type="button" className={Sam.btn.secondary} onClick={onCancel} disabled={saving}>
                      {ko ? "취소" : "Cancel"}
                    </button>
                    <button
                      type="button"
                      className="rounded-ui-rect bg-emerald-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                      onClick={() => void onSave()}
                      disabled={saving || loading}
                    >
                      {t("admin_stores_home_shelves_save")}
                    </button>
                  </div>
                </>
              ) : (
                <p className="p-6 text-[13px] text-sam-muted">{t("admin_stores_home_shelves_select_hint")}</p>
              )}
            </section>
          </div>
        )}
      </div>

      <DibayDialog
        open={modalMode === "add"}
        onClose={() => setModalMode(null)}
        title={ko ? "선반 추가" : "Add shelf"}
        description={
          ko
            ? "사용 가능한 비활성 선반을 복구해 HOME 목록에 추가합니다."
            : "Restore a disabled available shelf into the HOME list."
        }
      >
        <div className="mt-4 space-y-4 text-left">
          <div className="space-y-2">
            <p className="text-[12px] font-semibold text-sam-fg">{ko ? "복구 가능한 선반" : "Recoverable shelves"}</p>
            {disabledAvailableRows.length > 0 ? (
              <div className="space-y-2">
                {disabledAvailableRows.map((row) => (
                  <label
                    key={row.shelfId}
                    className="flex cursor-pointer items-start gap-2 rounded-ui-rect border border-sam-border p-2 text-[12px]"
                  >
                    <input
                      type="radio"
                      name="add-shelf"
                      className="mt-0.5"
                      checked={addTargetId === row.shelfId}
                      onChange={() => setAddTargetId(row.shelfId)}
                    />
                    <span className="min-w-0">
                      <span className="block font-semibold text-sam-fg">{ko ? row.titleKo : row.titleEn}</span>
                      <span className="block text-sam-muted">
                        {t(`admin_stores_home_ds_${row.dataSource}`)} · {presentationShort(row.presentation, ko)}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="rounded-ui-rect bg-sam-surface-muted px-3 py-2 text-[12px] text-sam-muted">
                {ko ? "복구할 수 있는 비활성 선반이 없습니다." : "No disabled available shelves to restore."}
              </p>
            )}
          </div>
          {unavailableRows.length > 0 ? (
            <div className="space-y-2 border-t border-sam-border pt-3">
              <p className="text-[12px] font-semibold text-sam-fg">{ko ? "사용 불가" : "Unavailable"}</p>
              {unavailableRows.map((row) => (
                <p key={row.shelfId} className="rounded-ui-rect bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
                  <span className="font-semibold">{ko ? row.titleKo : row.titleEn}</span>
                  <br />
                  {ko ? row.unavailableReasonKo : row.unavailableReasonEn}
                </p>
              ))}
            </div>
          ) : null}
          <div className="flex gap-2">
            <DibayOverlayButton roleTone="secondary" onClick={() => setModalMode(null)}>
              {ko ? "취소" : "Cancel"}
            </DibayOverlayButton>
            <DibayOverlayButton
              roleTone="primary"
              disabled={!addTargetId}
              onClick={() => recoverShelf(addTargetId)}
            >
              {ko ? "복구" : "Restore"}
            </DibayOverlayButton>
          </div>
        </div>
      </DibayDialog>

      <DibayDialog
        open={modalMode === "duplicate"}
        onClose={() => setModalMode(null)}
        title={ko ? "선반 복제" : "Duplicate shelf"}
        description={
          duplicateSource
            ? ko
              ? `${duplicateSource.titleKo} 설정을 대상 선반에 복사합니다.`
              : `Copy ${duplicateSource.titleEn} settings into another shelf.`
            : undefined
        }
      >
        <div className="mt-4 space-y-4 text-left">
          <label className="block text-[12px] font-medium text-sam-muted">
            {ko ? "대상 선반" : "Target shelf"}
            <select
              className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-[13px]"
              value={duplicateTargetId}
              onChange={(e) => setDuplicateTargetId(e.target.value)}
            >
              {duplicateTargets.map((row) => (
                <option key={row.shelfId} value={row.shelfId}>
                  {ko ? row.titleKo : row.titleEn}
                </option>
              ))}
            </select>
          </label>
          <p className="text-[12px] text-sam-muted">
            {ko
              ? "제목, 부제목, 표현, 엔티티, 이미지 소스, 전체보기, 쿠폰/광고, 최대 개수, 운영 메모를 복사합니다."
              : "Copies titles, subtitles, presentation, entity, image source, show-all settings, coupon/ad, max, and memo."}
          </p>
          <div className="flex gap-2">
            <DibayOverlayButton roleTone="secondary" onClick={() => setModalMode(null)}>
              {ko ? "취소" : "Cancel"}
            </DibayOverlayButton>
            <DibayOverlayButton
              roleTone="primary"
              disabled={!duplicateTargetId || !duplicateSource}
              onClick={applyDuplicate}
            >
              {ko ? "복제" : "Duplicate"}
            </DibayOverlayButton>
          </div>
        </div>
      </DibayDialog>

      <DibayDialog
        open={modalMode === "delete"}
        onClose={() => setModalMode(null)}
        title={ko ? "선반 삭제" : "Delete shelf"}
        description={
          ko
            ? "카탈로그 항목은 삭제하지 않고 사용안함으로 전환합니다."
            : "The catalog item remains and will be disabled."
        }
      >
        <div className="mt-4 flex gap-2">
          <DibayOverlayButton roleTone="secondary" onClick={() => setModalMode(null)}>
            {ko ? "취소" : "Cancel"}
          </DibayOverlayButton>
          <DibayOverlayButton roleTone="destructive" onClick={disableSelected}>
            {ko ? "삭제" : "Delete"}
          </DibayOverlayButton>
        </div>
      </DibayDialog>
    </AdminDeliveryCmsChrome>
  );
}
