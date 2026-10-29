"use client";

/**
 * HOME shelf CMS — operator edit surface.
 * Keeps the existing PUT contract while matching the delivery CMS mockup behavior.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AdminDeliveryCmsChrome } from "@/components/admin/shell/AdminDeliveryCmsChrome";
import { AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminSwitch } from "@/components/admin/ui/AdminSwitch";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { AdminConfigAuditHistoryPanel } from "@/components/admin/delivery/AdminConfigAuditHistoryPanel";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayDialog, DibayOverlayButton } from "@/components/ui/dibay-overlay";
import { Sam } from "@/lib/ui/sam-component-classes";
import { placementMapFocusHref } from "@/lib/admin/placement-map-read-model";
import { resolveHomeShelfShowAllHrefForShelf } from "@/lib/stores/product/stores-home-shelf-product-config";
import {
  countHomeDataSourceCandidates,
  diagnoseHomeShelfCustomerHidden,
} from "@/lib/stores/product/stores-home-data-source";
import { resolvePopularityWindowDays } from "@/lib/stores/store-discovery-popular-store";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import type { StoresHomeShelfResolvedConfig } from "@/lib/stores/product/stores-home-shelf-product-resolve";
import {
  AdminStoresHomeShelfLivePreview,
  type AdminHomeShelfPreviewFeed,
} from "@/components/admin/stores/AdminStoresHomeShelfLivePreview";
import {
  buildAdminHomeShelfDraftPreview,
  countAdminHomeShelfRenderedItems,
} from "@/lib/stores/product/stores-home-shelf-admin-preview";
import type { StoresHomeCompositionPolicyMeta } from "@/lib/stores/composition/stores-composition-live";
import type { StoresHomeInsertionMeta } from "@/lib/stores/composition/stores-composition-home-insertion-meta";
import { invalidateStoreHomeFeedClientCache } from "@/lib/stores/store-home-feed-client-cache";
import { clearStoresHomeFeedLiveStore } from "@/lib/stores/stores-home-feed-live-store";
import {
  AdminHomeShelfTabFields,
  type AdminHomeDraftShelf,
} from "@/components/admin/stores/AdminHomeShelfTabFields";
import {
  HOME_SHELF_ADMIN_TABS,
  isHomeRestShelf,
  type HomeShelfAdminTab,
} from "@/lib/stores/product/stores-home-shelf-admin-tabs";

type DraftShelf = AdminHomeDraftShelf;

type HomeTab = HomeShelfAdminTab;
type ModalMode = "add" | "duplicate" | "delete" | null;

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

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return <AdminSwitch checked={checked} onChange={onChange} disabled={disabled} />;
}

/** 기존 /admin/stores-home-shelves 화면 — 편집기를 배달 CMS 셸에 담는다. */
export function AdminStoresHomeShelvesPage() {
  return (
    <AdminDeliveryCmsChrome help="home">
      <AdminStoresHomeShelvesEditor />
    </AdminDeliveryCmsChrome>
  );
}

/**
 * 5-F — HOME 선반 편집 본문. `/admin/stores-home-shelves` 와 `/admin/delivery-screens?tab=home` 이 같은 컴포넌트를 쓴다.
 * `embedded` = 허브 안에서 페이지 제목 대신 구역 제목을 쓴다.
 */
export function AdminStoresHomeShelvesEditor({
  embedded = false,
  onSaved,
}: {
  embedded?: boolean;
  /** 저장 성공 후 (허브 현황 새로고침용) */
  onSaved?: () => void;
} = {}) {
  const { t, language } = useI18n();
  const ko = language === "ko";
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  /** Load failure (code) — DEF-48: never shown as 「저장 실패」. */
  const [err, setErr] = useState<string | null>(null);
  const [errStatus, setErrStatus] = useState<number | undefined>(undefined);
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
  /** H-11 — 미리보기·목록 집계가 같은 home-feed 1회 응답을 쓴다 (미리보기 별도 fetch 제거). */
  const [homeFeedPolicyMeta, setHomeFeedPolicyMeta] = useState<StoresHomeCompositionPolicyMeta | null>(null);
  const [homeFeedInsertions, setHomeFeedInsertions] = useState<StoresHomeInsertionMeta | undefined>(undefined);
  const [homeFeedStatus, setHomeFeedStatus] = useState<"loading" | "ready" | "error">("loading");
  const [homeFeedError, setHomeFeedError] = useState<string>("");
  const [homeFeedReloadTick, setHomeFeedReloadTick] = useState(0);
  const [popularityOverlayCounts, setPopularityOverlayCounts] = useState<
    Record<string, Record<string, number>>
  >({});
  const [popularityUntilIso, setPopularityUntilIso] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    setErrStatus(undefined);
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
        setErr(json.error ?? "load_failed");
        setErrStatus(res.status);
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
      setErr("network_error");
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
    setHomeFeedStatus("loading");
    void (async () => {
      try {
        const res = await fetch("/api/stores/home-feed?fresh=1", { credentials: "include", cache: "no-store" });
        const json = (await res.json()) as {
          ok?: boolean;
          error?: string;
          stores?: StoreHomeFeedItem[];
          meta?: {
            popularityOverlay?: { untilIso?: string; countsByDays?: Record<string, Record<string, number>> };
            compositionPolicy?: StoresHomeCompositionPolicyMeta & {
              popularityOverlay?: { untilIso?: string; countsByDays?: Record<string, Record<string, number>> };
            };
            homeInsertions?: StoresHomeInsertionMeta;
          };
        };
        if (cancelled) return;
        if (!json.ok || !Array.isArray(json.stores)) {
          setHomeFeedStatus("error");
          setHomeFeedError(json.error?.trim() || (ko ? "홈 피드를 불러오지 못했습니다." : "Failed to load home feed."));
          return;
        }
        setHomeFeedStores(json.stores);
        setHomeFeedPolicyMeta(json.meta?.compositionPolicy ?? null);
        setHomeFeedInsertions(json.meta?.homeInsertions);
        const overlay =
          json.meta?.popularityOverlay ?? json.meta?.compositionPolicy?.popularityOverlay;
        setPopularityOverlayCounts(overlay?.countsByDays ?? {});
        setPopularityUntilIso(overlay?.untilIso ?? null);
        setHomeFeedStatus("ready");
      } catch (e) {
        if (cancelled) return;
        setHomeFeedStatus("error");
        setHomeFeedError(e instanceof Error ? e.message : ko ? "홈 피드 오류" : "Home feed error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ko, homeFeedReloadTick]);

  const editableRows = useMemo(
    () =>
      [...rows]
        .filter((row) => row.availability !== "unavailable")
        /** HS-05 — 「더 많은 매장」은 앱 레이아웃 계약상 항상 마지막 (stores-composition-home-section-order). */
        .sort(
          (a, b) =>
            Number(isHomeRestShelf(a)) - Number(isHomeRestShelf(b)) ||
            orderFromDraft(a.draftOrder, a.order) - orderFromDraft(b.draftOrder, b.order)
        ),
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
  /** H-11·H-12 — 초안 전체를 앱과 같은 조합에 넣은 결과 (미리보기·목록 표시 수 공용). */
  const draftPreview = useMemo(() => {
    if (homeFeedStatus !== "ready") return null;
    const draftShelves: StoresHomeShelfResolvedConfig[] = rows.map((row) => {
      const { draftMax, draftOrder, ...shelf } = row;
      return {
        ...shelf,
        max: draftMax.trim() === "" ? null : (maxFromDraft(draftMax) ?? shelf.max),
        order: orderFromDraft(draftOrder, shelf.order),
      };
    });
    return buildAdminHomeShelfDraftPreview({
      draftShelves,
      stores: homeFeedStores,
      policyMeta: homeFeedPolicyMeta,
    });
  }, [homeFeedPolicyMeta, homeFeedStatus, homeFeedStores, rows]);
  const previewFeed: AdminHomeShelfPreviewFeed =
    homeFeedStatus === "ready"
      ? { status: "ready", stores: homeFeedStores, homeInsertions: homeFeedInsertions }
      : homeFeedStatus === "error"
        ? { status: "error", message: homeFeedError }
        : { status: "loading" };

  const selected = rows.find((shelf) => shelf.shelfId === selectedId) ?? null;
  const selectedEditable = selected && selected.availability !== "unavailable" ? selected : null;
  const duplicateSource = rows.find((shelf) => shelf.shelfId === duplicateSourceId) ?? selectedEditable;
  const duplicateTargets = editableRows.filter((row) => row.shelfId !== duplicateSource?.shelfId);
  const showAllHref = selectedEditable ? resolveHomeShelfShowAllHrefForShelf(selectedEditable) : null;

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
    /** HS-05 — 「더 많은 매장」은 앱에서 항상 마지막 → 관리자 목록에서도 끌어 옮기지 않는다. */
    if (fromIdx >= 0 && isHomeRestShelf(editableRows[fromIdx]!)) return;
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
              /** HS-03 — 광고 연동은 대상 선반 자신의 값 유지 (일반 선반은 항상 끔). */
              adIntegration: row.adIntegration,
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
      invalidateStoreHomeFeedClientCache("");
      clearStoresHomeFeedLiveStore();
      await load();
      /** load() 가 시작 시 toast 를 비우므로 재조회 뒤에 성공 배너를 띄운다. */
      setToast(t("admin_stores_home_shelves_save_ok"));
      onSaved?.();
    } catch {
      setSaveErr("save_fail");
    } finally {
      setSaving(false);
    }
  };

  /** 선반 1개의 후보 수·앱 표시 수·숨김 진단 (목록 행·데이터 탭 공용). */
  const rowStats = (row: DraftShelf) => {
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
    const draftShelf = draftPreview?.shelves.find((s) => s.shelfId === row.shelfId);
    /** H-12 — 앱에 실제로 그려질 수 (배달 범위·대표 메뉴·선반 간 중복·최대 개수 반영). */
    const renderedCount =
      draftPreview && draftShelf ? countAdminHomeShelfRenderedItems(draftPreview.composition, draftShelf) : null;
    const diag = diagnoseHomeShelfCustomerHidden({
      unavailable: row.availability === "unavailable",
      enabled: row.enabled,
      scheduleOk: draftShelf ? draftShelf.customerVisible || !row.enabled : !row.enabled || row.customerVisible,
      candidateCount,
      allocatedCount: renderedCount ?? candidateCount,
    });
    return { candidateCount, renderedCount, diag };
  };

  return (
    <>
      <div className="space-y-3" data-admin-home-cms="mockup-v3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          {embedded ? (
            <div>
              <h2 className="text-[16px] font-bold text-sam-fg">{ko ? "홈 선반" : "HOME shelves"}</h2>
              <p className="text-[12px] text-sam-muted">
                {ko ? "히어로 배너 아래 · 「더 많은 매장」 위에 차례로 표시됩니다." : "Shown below the hero banner, above the remaining stores."}
              </p>
            </div>
          ) : (
            <div>
              <p className="text-[12px] text-sam-muted">{ko ? "배달 › HOME 관리" : "Delivery › HOME management"}</p>
              <h1 className="text-[20px] font-bold text-sam-fg">{t("admin_stores_home_shelves_title")}</h1>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/advertising"
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
            <AdminActionButton variant="secondary" onClick={() => void load()} disabled={loading}>
              {t("admin_stores_home_shelves_reload")}
            </AdminActionButton>
          </div>
        </div>

        <p
          className="rounded-ui-rect border border-sam-warning bg-sam-warning-soft px-3 py-2 text-[12px] text-sam-warning"
          data-admin-home-ads-boundary="1"
        >
          {ko
            ? "이 화면은 유기(organic) 홈 구성·슬롯 허용만 관리합니다. 유료 광고 승인·일시중지·종료는 「광고 운영」에서 처리하세요. 광고 집행 상태를 여기서 바꾸지 않습니다."
            : "This screen manages organic HOME composition and slot allowance only. Approve / pause / end paid ads in Ads ops. Do not mutate paid execution here."}
        </p>

        {toast ? <p className="text-[13px] text-sam-success">{toast}</p> : null}
        {saveErr ? (
          <p className="text-[13px] text-sam-danger">
            {saveErr === "stale_revision"
              ? t("admin_stores_home_shelves_stale_revision")
              : saveErr === "save_fail"
                ? t("admin_stores_home_shelves_save_fail")
                : `${t("admin_stores_home_shelves_save_fail")} (${saveErr})`}
          </p>
        ) : null}
        {err ? <AdminErrorState ko={ko} code={err} httpStatus={errStatus} onRetry={() => void load()} /> : null}

        {loading ? (
          <AdminLoadingState ko={ko} label={t("admin_stores_home_shelves_loading")} />
        ) : err ? null : (
          <div className="grid gap-4 xl:grid-cols-[minmax(300px,340px)_minmax(0,1fr)]">
            <aside className="rounded-ui-rect border border-sam-border bg-white">
              <div className="flex items-center justify-between gap-2 border-b border-sam-border px-3 py-2.5">
                <div>
                  <p className="text-[13px] font-bold text-sam-fg">{ko ? "HOME 선반 목록" : "HOME shelf list"}</p>
                  <p className="text-[12px] text-sam-muted">{ko ? "드래그하여 순서를 변경하세요" : "Drag to change order"}</p>
                </div>
                {/* 화면 primary 는 「저장」 1개 — 선반 추가는 secondary */}
                <AdminActionButton variant="secondary" size="sm" onClick={openAddModal}>
                  {ko ? "+ 선반 추가" : "+ Add shelf"}
                </AdminActionButton>
              </div>

              <ul className="max-h-[70vh] space-y-1 overflow-y-auto p-2">
                {editableRows.map((row, index) => {
                  const active = row.shelfId === selectedId;
                  const name = ko ? row.titleKo : row.titleEn;
                  const typeLine = `${t(`admin_stores_home_ds_${row.dataSource}`)} · ${presentationShort(row.presentation, ko)}`;
                  const { candidateCount, renderedCount, diag } = rowStats(row);
                  const restLocked = isHomeRestShelf(row);
                  const visibleOnApp =
                    diag.customerVisible ||
                    diag.hiddenReason === "empty_candidate" ||
                    diag.hiddenReason === "empty_allocated";
                  const statusLine = visibleOnApp
                    ? `${ko ? "후보" : "cand"} ${candidateCount} · ${ko ? "고객 노출" : "visible"} YES · ${
                        ko ? "표시" : "shown"
                      } ${renderedCount ?? "-"}${
                        renderedCount === 0 ? (ko ? " (제목·빈 상태)" : " (title + empty state)") : ""
                      }`
                    : `${ko ? "후보" : "cand"} ${candidateCount} · ${
                        diag.hiddenReason ? t(`admin_stores_home_hidden_${diag.hiddenReason}`) : ""
                      }`;
                  return (
                    <li key={row.shelfId} className="relative">
                      <div
                        draggable={!restLocked}
                        data-home-shelf-rest-locked={restLocked ? "1" : undefined}
                        onDragStart={() => {
                          if (!restLocked) setDragId(row.shelfId);
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDragEnd={() => setDragId(null)}
                        onDrop={() => {
                          if (dragId) reorder(dragId, row.shelfId);
                          setDragId(null);
                        }}
                        onClick={() => selectShelf(row.shelfId)}
                        className={`flex cursor-pointer items-center gap-2 rounded-ui-rect px-2 py-2 ${
                          active ? "bg-sam-success-soft ring-1 ring-sam-success" : "hover:bg-sam-surface-muted"
                        } ${row.enabled ? "" : "opacity-70"}`}
                      >
                        <span className={`${restLocked ? "" : "cursor-grab"} text-sam-muted`} aria-hidden>
                          {restLocked ? "—" : "::"}
                        </span>
                        <span className="w-5 shrink-0 text-center text-[12px] font-semibold text-sam-muted">{index + 1}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-semibold text-sam-fg">
                            {name}
                            {restLocked ? (
                              <span className="ml-1.5 rounded-ui-rect bg-sam-surface-muted px-1.5 py-0.5 text-[12px] font-semibold text-sam-muted">
                                {ko ? "항상 마지막" : "Always last"}
                              </span>
                            ) : null}
                          </p>
                          <p className="truncate text-[12px] text-sam-muted">{typeLine}</p>
                          <p className="truncate text-[12px] text-sam-muted">{statusLine}</p>
                        </div>
                        <Toggle checked={row.enabled} onChange={(value) => update(row.shelfId, { enabled: value })} />
                        <AdminActionButton
                          variant="quiet"
                          size="sm"
                          className="px-1.5"
                          aria-label={ko ? "선반 메뉴" : "Shelf menu"}
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuShelfId((prev) => (prev === row.shelfId ? null : row.shelfId));
                          }}
                        >
                          ⋯
                        </AdminActionButton>
                      </div>
                      {menuShelfId === row.shelfId ? (
                        <div className="absolute right-2 top-9 z-10 w-28 overflow-hidden rounded-ui-rect border border-sam-border bg-white py-1 text-[12px] shadow-lg">
                          <AdminActionButton
                            variant="quiet"
                            size="sm"
                            className="w-full justify-start rounded-none"
                            onClick={() => openDuplicateModal(row.shelfId)}
                          >
                            {ko ? "복제" : "Duplicate"}
                          </AdminActionButton>
                          <AdminActionButton
                            variant="quiet"
                            size="sm"
                            className="w-full justify-start rounded-none"
                            onClick={() => {
                              update(row.shelfId, { enabled: false });
                              setMenuShelfId(null);
                              setToast(ko ? "선반을 사용안함으로 변경했습니다." : "Shelf disabled.");
                            }}
                          >
                            {ko ? "사용안함" : "Disable"}
                          </AdminActionButton>
                          <AdminActionButton
                            variant="quiet"
                            size="sm"
                            className="w-full justify-start rounded-none"
                            onClick={() => selectShelf(row.shelfId)}
                          >
                            {ko ? "선택" : "Select"}
                          </AdminActionButton>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>

              {unavailableRows.length > 0 ? (
                <div className="border-t border-sam-border p-3">
                  <p className="mb-2 text-[12px] font-semibold text-sam-muted">
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
                          <span className="shrink-0 rounded bg-sam-border/60 px-1.5 py-0.5 text-[12px] font-semibold uppercase">
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
                        className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${
                          selectedEditable.enabled
                            ? "bg-sam-success-soft text-sam-success"
                            : "bg-sam-surface-muted text-sam-muted"
                        }`}
                      >
                        {selectedEditable.enabled ? (ko ? "사용 중" : "Active") : ko ? "비활성" : "Off"}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2 text-[12px]">
                      <AdminActionButton
                        variant="secondary"
                        size="sm"
                        onClick={() => previewRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}
                      >
                        {ko ? "미리보기" : "Preview"}
                      </AdminActionButton>
                      <AdminActionButton variant="secondary" size="sm" onClick={() => openDuplicateModal(selectedEditable.shelfId)}>
                        {ko ? "복제" : "Duplicate"}
                      </AdminActionButton>
                      <AdminActionButton variant="danger" size="sm" onClick={() => setModalMode("delete")}>
                        {adminCta("delete", ko)}
                      </AdminActionButton>
                    </div>
                  </div>

                  <div className="px-2 pt-2">
                    <AdminTabs
                      tabs={HOME_SHELF_ADMIN_TABS.map((item) => ({ id: item.id, label: ko ? item.labelKo : item.labelEn }))}
                      ariaLabel={ko ? "선반 설정" : "Shelf settings"}
                      value={tab}
                      onChange={(id) => setTab(id as HomeTab)}
                      syncUrl={false}
                    />
                  </div>

                  {/* HS-01 — 탭당 필드 1회 · 미리보기는 모든 탭에서 표시 */}
                  <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,320px)]">
                    <div className="space-y-4">
                      {(() => {
                        const stats = homeFeedStatus === "ready" ? rowStats(selectedEditable) : null;
                        return (
                          <AdminHomeShelfTabFields
                            shelf={selectedEditable}
                            tab={tab}
                            onUpdate={(patch) => update(selectedEditable.shelfId, patch)}
                            onUpdateProductConfig={(patch) => updateProductConfig(selectedEditable, patch)}
                            candidateCount={stats?.candidateCount ?? null}
                            renderedCount={stats?.renderedCount ?? null}
                            popularityUntilIso={popularityUntilIso}
                            showAllHref={showAllHref}
                          />
                        );
                      })()}
                    </div>
                    <div ref={previewRef} className="space-y-3">
                        <p className="text-[12px] font-bold text-sam-fg">{t("admin_stores_home_shelves_preview_title")}</p>
                        <p className="text-[12px] text-sam-muted">
                          {ko
                            ? "HOME은 선반(composer slot) 위주입니다. 미리보기는 고객 home-feed 실데이터입니다."
                            : "HOME is shelf-led (composer slots). Preview uses live customer home-feed data."}
                        </p>
                        <AdminStoresHomeShelfLivePreview
                          shelfId={selectedEditable.shelfId}
                          feed={previewFeed}
                          preview={draftPreview}
                          onReload={() => setHomeFeedReloadTick((n) => n + 1)}
                        />
                    </div>
                  </div>

                  <div className="sticky bottom-0 flex justify-end gap-2 border-t border-sam-border bg-white px-4 py-3">
                    <AdminActionButton variant="secondary" onClick={onCancel} disabled={saving}>
                      {adminCta("cancel", ko)}
                    </AdminActionButton>
                    <AdminActionButton variant="primary" onClick={() => void onSave()} disabled={saving || loading}>
                      {t("admin_stores_home_shelves_save")}
                    </AdminActionButton>
                  </div>
                </>
              ) : (
                <p className="p-6 text-[13px] text-sam-muted">{t("admin_stores_home_shelves_select_hint")}</p>
              )}
            </section>
          </div>
        )}
        {/* DEF-40: 홈 선반 저장 감사 기록 (변경자·시각·사유) */}
        <div className="rounded-ui-rect border border-sam-border bg-white p-3">
          <AdminConfigAuditHistoryPanel scope="home_shelves" limit={20} refreshToken={revision ?? 0} />
        </div>
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
                <p key={row.shelfId} className="rounded-ui-rect bg-sam-warning-soft px-3 py-2 text-[12px] text-sam-warning">
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
              ? "제목, 부제목, 표현, 엔티티, 이미지 소스, 전체보기, 쿠폰, 최대 개수, 운영 메모를 복사합니다."
              : "Copies titles, subtitles, presentation, entity, image source, show-all settings, coupon, max, and memo."}
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
    </>
  );
}
