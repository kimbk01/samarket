"use client";

/**
 * CUT F — Full App Placement Map panel (read-only).
 * Mounted on /admin/delivery-ads/inventory — not a new shell.
 * CUT I — optional ?execution=campaignId ACTIVE/eligibility panel (domain loaders only).
 */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminActionButton, AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { AdminChipButton } from "@/components/admin/ui/AdminChipButton";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminCard } from "@/components/admin/AdminCard";
import { DeliveryAdPlacementMiniature } from "@/components/stores/advertising/DeliveryAdPlacementMiniature";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import {
  filterPlacementMapRows,
  listAllPlacementMapRows,
  PLACEMENT_MAP_HASH,
  type PlacementMapDomain,
  type PlacementMapRow,
  type PlacementMapScreen,
} from "@/lib/admin/placement-map-read-model";
import {
  buildPlacementMapExecutionSnapshot,
  type PlacementMapExecutionSnapshot,
} from "@/lib/admin/placement-map-execution-snapshot";
import type { DeliveryAdInventoryKey } from "@/lib/stores/advertising/delivery-ad-inventory";
import type { PlacementMiniatureKind } from "@/lib/stores/advertising/delivery-ad-launch-placement-product";
import type { DeliveryAdFundingStatus } from "@/lib/stores/advertising/delivery-ad-business-cash-contract";

const DOMAINS: { id: PlacementMapDomain | "ALL"; ko: string; en: string }[] = [
  { id: "ALL", ko: "전체", en: "All" },
  { id: "DELIVERY", ko: "배달", en: "Delivery" },
  { id: "FEED", ko: "피드", en: "Feed" },
  { id: "POPUP", ko: "팝업", en: "Popup" },
];

const SCREENS: { id: PlacementMapScreen | "ALL"; ko: string; en: string }[] = [
  { id: "ALL", ko: "전체 화면", en: "All screens" },
  { id: "DELIVERY_HOME", ko: "배달 홈", en: "Delivery Home" },
  { id: "DELIVERY_CATEGORY", ko: "업종 목록", en: "Category" },
  { id: "DELIVERY_SEARCH", ko: "검색 결과", en: "Search results" },
  { id: "STORE_DETAIL", ko: "매장 상세", en: "Store detail" },
  { id: "TRADE_FEED", ko: "거래 피드", en: "Trade feed" },
  { id: "COMMUNITY_FEED", ko: "커뮤니티 피드", en: "Community feed" },
  { id: "GLOBAL_POPUP", ko: "글로벌 팝업", en: "Global popup" },
];

function miniatureKind(placementId: string): PlacementMiniatureKind | null {
  switch (placementId as DeliveryAdInventoryKey) {
    case "STORES_HOME_HERO":
      return "home_hero_carousel";
    case "STORES_HOME_FEED":
    case "STORES_HOME_INLINE_1":
      return "home_interleave";
    case "STORES_CATEGORY_FEED":
    case "STORES_CATEGORY_TOP":
    case "STORES_CATEGORY_INLINE":
      return "category_interleave";
    case "STORES_SEARCH_TOP":
      return "search_top_single";
    default:
      return null;
  }
}

function Flag({
  on,
  labelKo,
  labelEn,
  ko,
}: {
  on: boolean;
  labelKo: string;
  labelEn: string;
  ko: boolean;
}) {
  return (
    <span
      className={`inline-flex rounded-ui-rect px-2 py-0.5 text-[12px] font-semibold ${
        on ? "bg-sam-success-soft text-sam-success" : "bg-sam-app text-sam-muted"
      }`}
    >
      {ko ? labelKo : labelEn}
    </span>
  );
}

function Factor({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok?: boolean | null;
}) {
  const tone =
    ok === true
      ? "text-sam-success"
      : ok === false
        ? "text-sam-danger"
        : "text-sam-fg";
  return (
    <li className={`flex flex-wrap justify-between gap-2 ${tone}`}>
      <span className="text-sam-muted">{label}</span>
      <span className="font-mono text-[12px] font-semibold">{value}</span>
    </li>
  );
}

export function AdminPlacementMapPanel() {
  return (
    <Suspense fallback={<AdminLoadingState ko />}>
      <AdminPlacementMapPanelInner />
    </Suspense>
  );
}

const DEFAULT_MAP_DOMAIN: PlacementMapDomain | "ALL" = "DELIVERY";

function AdminPlacementMapPanelInner() {
  const { safeT, language } = useI18n();
  const ko = language !== "en";
  const allRows = useMemo(() => listAllPlacementMapRows(), []);
  /**
   * R7 목록 표준 8 — 영역(`?area=`)·화면(`?screen=`) 칩 필터를 주소에 둔다.
   * `focus`·`execution` 딥링크 키는 관리하지 않는 키라 그대로 유지된다.
   */
  const lq = useAdminListQuery<"area" | "screen">({
    extras: ["area", "screen"],
    extraDefaults: { area: DEFAULT_MAP_DOMAIN, screen: "ALL" },
  });
  const domain: PlacementMapDomain | "ALL" = DOMAINS.some((d) => d.id === lq.query.extras.area)
    ? (lq.query.extras.area as PlacementMapDomain | "ALL")
    : DEFAULT_MAP_DOMAIN;
  const screen: PlacementMapScreen | "ALL" = SCREENS.some((s) => s.id === lq.query.extras.screen)
    ? (lq.query.extras.screen as PlacementMapScreen | "ALL")
    : "ALL";
  const { patch: patchMapQuery } = lq;
  const setDomainAndResetScreen = useCallback(
    (d: PlacementMapDomain | "ALL") => patchMapQuery({ extras: { area: d, screen: "ALL" } }),
    [patchMapQuery]
  );
  const setScreen = useCallback(
    (sc: PlacementMapScreen | "ALL") => patchMapQuery({ extras: { screen: sc } }),
    [patchMapQuery]
  );
  const [occupancyNonce, setOccupancyNonce] = useState(0);
  const [executionNonce, setExecutionNonce] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [executionSnap, setExecutionSnap] = useState<PlacementMapExecutionSnapshot | null>(
    null
  );
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [executionLoading, setExecutionLoading] = useState(false);
  const [occupancyByKey, setOccupancyByKey] = useState<
    Record<
      string,
      {
        capacity: number;
        liveCount: number;
        vacant: number;
        reservedCount: number;
        vacancyLabelKo: string;
        vacancyLabelEn: string;
      }
    >
  >({});
  const [occupancyState, setOccupancyState] = useState<"loading" | "ok" | "unavailable">(
    "loading"
  );

  const [occupancyError, setOccupancyError] = useState<{ code: string; status?: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    setOccupancyState("loading");
    setOccupancyError(null);
    void (async () => {
      try {
        const res = await fetch("/api/admin/ads-control-plane", { credentials: "include" });
        const json = (await res.json()) as {
          ok?: boolean;
          plane?: {
            occupancy?: Array<{
              placementKey: string;
              capacity: number;
              liveCount: number;
              vacant: number;
              reservedCount: number;
              vacancyLabelKo: string;
              vacancyLabelEn: string;
            }>;
            queues?: { vacantSlots?: { unavailable?: boolean } };
          };
        };
        if (cancelled) return;
        if (!res.ok || !json.ok || json.plane?.queues?.vacantSlots?.unavailable) {
          setOccupancyState("unavailable");
          setOccupancyError({
            code: !res.ok || !json.ok ? "load_failed" : "occupancy_unavailable",
            status: res.ok ? undefined : res.status,
          });
          setOccupancyByKey({});
          return;
        }
        const map: typeof occupancyByKey = {};
        for (const o of json.plane?.occupancy ?? []) {
          map[o.placementKey] = {
            capacity: o.capacity,
            liveCount: o.liveCount,
            vacant: o.vacant,
            reservedCount: o.reservedCount,
            vacancyLabelKo: o.vacancyLabelKo,
            vacancyLabelEn: o.vacancyLabelEn,
          };
        }
        setOccupancyByKey(map);
        setOccupancyState("ok");
      } catch {
        if (!cancelled) {
          setOccupancyState("unavailable");
          setOccupancyError({ code: "network_error" });
          setOccupancyByKey({});
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [occupancyNonce]);

  const focusAppliedRef = useRef(false);
  useEffect(() => {
    if (typeof window === "undefined" || focusAppliedRef.current) return;
    focusAppliedRef.current = true;
    const params = new URLSearchParams(window.location.search);
    const focus = params.get("focus")?.trim() || "";
    const execution = params.get("execution")?.trim() || "";
    if (focus) {
      setSelectedId(focus);
      const row = allRows.find((r) => r.placementId === focus);
      if (row) {
        patchMapQuery({ extras: { area: row.domain, screen: row.screen } });
      }
    }
    if (execution) setExecutionId(execution);
  }, [allRows, patchMapQuery]);

  useEffect(() => {
    if (!executionId) {
      setExecutionSnap(null);
      setExecutionError(null);
      return;
    }
    let cancelled = false;
    setExecutionLoading(true);
    setExecutionError(null);
    void (async () => {
      try {
        const res = await fetch(
          `/api/admin/delivery-ads/${encodeURIComponent(executionId)}`,
          { credentials: "include" }
        );
        const json = (await res.json()) as {
          ok?: boolean;
          error?: string;
          campaign?: {
            id: string;
            productKind: string;
            storeId: string | null;
            lifecycleStatus: string;
            reviewStatus: string;
            inventoryKeys: string[];
            creativeId: string | null;
            imageUrl: string | null;
            startAt: string;
            endAt: string;
            campaignSource?: string | null;
            ctaHref?: string | null;
            title?: string | null;
            headline?: string | null;
          };
          creative?: { assetPath?: string | null; id?: string | null } | null;
        };
        if (!res.ok || !json.ok || !json.campaign) {
          if (!cancelled) {
            setExecutionError(json.error ?? "execution_load_failed");
            setExecutionSnap(null);
          }
          return;
        }
        let fundingStatus: DeliveryAdFundingStatus | null = null;
        const product =
          json.campaign.productKind === "banner" ||
          json.campaign.productKind === "store_sponsored"
            ? json.campaign.productKind
            : null;
        if (product) {
          try {
            const fRes = await fetch(
              `/api/admin/delivery-ads/business-cash?campaignId=${encodeURIComponent(executionId)}&product=${encodeURIComponent(product)}`,
              { credentials: "include" }
            );
            const fJson = (await fRes.json()) as {
              ok?: boolean;
              funding?: {
                status?: DeliveryAdFundingStatus;
                fundingStatus?: DeliveryAdFundingStatus;
              };
            };
            if (fRes.ok && fJson.ok) {
              fundingStatus =
                fJson.funding?.status ?? fJson.funding?.fundingStatus ?? null;
            }
          } catch {
            fundingStatus = null;
          }
        }
        if (cancelled) return;
        setExecutionSnap(
          buildPlacementMapExecutionSnapshot({
            campaign: json.campaign,
            creativeAssetPath: json.creative?.assetPath ?? null,
            fundingStatus,
            focusPlacementId: selectedId,
          })
        );
      } catch {
        if (!cancelled) {
          setExecutionError("execution_load_failed");
          setExecutionSnap(null);
        }
      } finally {
        if (!cancelled) setExecutionLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [executionId, selectedId, executionNonce]);

  const rows = useMemo(
    () => filterPlacementMapRows(allRows, { domain, screen }),
    [allRows, domain, screen]
  );
  const selected: PlacementMapRow | null =
    rows.find((r) => r.placementId === selectedId) ??
    allRows.find((r) => r.placementId === selectedId) ??
    null;
  const mini = selected ? miniatureKind(selected.placementId) : null;

  return (
    <section
      id={PLACEMENT_MAP_HASH}
      className="scroll-mt-20 space-y-4"
      data-admin-placement-map="1"
      data-admin-placement-map-entry="inventory"
    >
      <div>
        <h2 className="text-[16px] font-bold text-sam-fg">
          {safeT("admin_placement_map_title", {
            fallbackKo: "노출 위치 (지면 점유)",
            fallbackEn: "Placements (occupancy)",
          })}
        </h2>
        <p className="mt-1 text-[12px] text-sam-muted">
          {safeT("admin_placement_map_desc", {
            fallbackKo:
              "서비스·화면별 유료 지면의 용량·사용·빈 자리를 봅니다. 기술 키·레지스트리는 「기술 정보」에만 둡니다. HOME/CATEGORY 유기 설정은 슬롯 허용만 — 광고 집행을 바꾸지 않습니다.",
            fallbackEn:
              "Capacity, used, and vacant slots by surface. Registry keys stay under Technical info. HOME/CATEGORY organic config is slot allowance only — it does not mutate paid execution.",
          })}
        </p>
        {occupancyState === "unavailable" ? (
          <div className="mt-2 space-y-2">
            <p className="text-[12px] font-semibold text-sam-warning">
              {ko
                ? "점유 정보를 불러올 수 없습니다. 빈 자리 0으로 간주하지 마세요."
                : "Occupancy unavailable — do not treat as vacancy 0."}
            </p>
            <AdminErrorState
              ko={ko}
              code={occupancyError?.code ?? "load_failed"}
              httpStatus={occupancyError?.status}
              onRetry={() => setOccupancyNonce((n) => n + 1)}
            />
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2" data-admin-placement-map-domain="1">
        {DOMAINS.map((d) => (
          <AdminChipButton
            key={d.id}
            selected={domain === d.id}
            onClick={() => setDomainAndResetScreen(d.id)}
          >
            {ko ? d.ko : d.en}
          </AdminChipButton>
        ))}
      </div>

      <div className="flex flex-wrap gap-2" data-admin-placement-map-screen="1">
        {SCREENS.filter(
          (s) =>
            s.id === "ALL" ||
            domain === "ALL" ||
            (domain === "DELIVERY" && s.id.startsWith("DELIVERY")) ||
            (domain === "DELIVERY" && s.id === "STORE_DETAIL") ||
            (domain === "FEED" && (s.id === "TRADE_FEED" || s.id === "COMMUNITY_FEED")) ||
            (domain === "POPUP" && s.id === "GLOBAL_POPUP")
        ).map((s) => (
          <AdminChipButton
            key={s.id}
            selected={screen === s.id}
            onClick={() => setScreen(s.id)}
          >
            {ko ? s.ko : s.en}
          </AdminChipButton>
        ))}
      </div>

      {(executionId || executionSnap || executionError || executionLoading) && (
        <AdminCard
          title={safeT("admin_placement_map_active_title", {
            fallbackKo: "ACTIVE 실행 / Eligibility",
            fallbackEn: "ACTIVE execution / Eligibility",
          })}
        >
          <div data-admin-placement-map-active="1" className="space-y-2 text-[12px]">
            {executionLoading ? <AdminLoadingState ko={ko} /> : null}
            {executionError ? (
              <div data-admin-placement-map-active-error="1">
                <AdminErrorState ko={ko} code={executionError} onRetry={() => setExecutionNonce((n) => n + 1)} />
              </div>
            ) : null}
            {executionSnap ? (
              <ul className="space-y-1.5" data-admin-placement-map-eligibility="1">
                <Factor label="execution" value={executionSnap.campaignId} />
                <Factor label="product" value={executionSnap.productKind} />
                <Factor
                  label="placement"
                  value={(selectedId ?? executionSnap.inventoryKeys.join(",")) || "—"}
                />
                <Factor
                  label="creative"
                  value={executionSnap.creativeId ?? "—"}
                  ok={executionSnap.creativeReady}
                />
                <Factor
                  label="lifecycle"
                  value={executionSnap.lifecycleStatus}
                  ok={executionSnap.lifecycleStatus === "ACTIVE"}
                />
                <Factor
                  label="approval"
                  value={executionSnap.reviewStatus}
                  ok={executionSnap.reviewStatus === "APPROVED"}
                />
                <Factor
                  label="funding"
                  value={executionSnap.fundingStatus}
                  ok={
                    executionSnap.fundingStatus === "FUNDED" ||
                    executionSnap.campaignSource === "DIBAY_FIRST_PARTY"
                  }
                />
                <Factor
                  label="schedule"
                  value={executionSnap.scheduleActive ? "in_window" : "out_of_window"}
                  ok={executionSnap.scheduleActive}
                />
                <Factor
                  label="creativeReady"
                  value={executionSnap.creativeReady ? "Y" : "N"}
                  ok={executionSnap.creativeReady}
                />
                <Factor
                  label="placementEnabled"
                  value={executionSnap.placementEnabled ? "Y" : "N"}
                  ok={executionSnap.placementEnabled}
                />
                <Factor
                  label="campaignGate"
                  value={
                    executionSnap.campaignGateOk == null
                      ? "N/A"
                      : executionSnap.campaignGateOk
                        ? "ELIGIBLE"
                        : `BLOCKED:${executionSnap.campaignGateReasons.join(",")}`
                  }
                  ok={executionSnap.campaignGateOk}
                />
                <Factor label="appRoute" value={selected?.runtimeRouteHint ?? "—"} />
                {executionSnap.notes.map((n) => (
                  <li key={n} className="text-[12px] text-sam-muted">
                    {n}
                  </li>
                ))}
                {executionSnap.creativeAssetPath ? (
                  <div data-admin-placement-map-creative="1">
                    <p className="mb-1 text-[12px] font-medium text-sam-muted">
                      {safeT("admin_placement_map_thumbnail_only", {
                        fallbackKo: "맵 썸네일 미리보기 (배치 렌더러 전체 미리보기 아님)",
                        fallbackEn: "Map thumbnail only (not full placement renderer preview)",
                      })}
                    </p>
                    <SamarketThumbnail
                      src={executionSnap.creativeAssetPath}
                      alt=""
                      size={160}
                      className="mt-2 max-h-28 border border-sam-border"
                      imageClassName="!object-contain"
                    />
                  </div>
                ) : null}
              </ul>
            ) : null}
            {!executionId ? (
              <p className="text-sam-muted">
                {safeT("admin_placement_map_active_hint", {
                  fallbackKo:
                    "광고 detail의「앱 위치 보기」로 들어오면 실행 ID가 연결됩니다.",
                  fallbackEn:
                    "Open「View app placement」 from ad detail to attach an execution ID.",
                })}
              </p>
            ) : null}
          </div>
        </AdminCard>
      )}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <div className="space-y-2" data-admin-placement-map-markers="1">
          {rows.length === 0 ? (
            <AdminEmptyState
              ko={ko}
              message={safeT("admin_placement_map_empty", {
                fallbackKo: "이 화면에는 광고 지면이 없습니다.",
                fallbackEn: "No ad placements on this screen.",
              })}
              onReset={lq.isFiltered ? lq.reset : undefined}
            />
          ) : (
            rows.map((row) => {
              const active = selectedId === row.placementId;
              const occ = occupancyByKey[row.placementId];
              return (
                <AdminActionButton
                  key={`${row.domain}:${row.placementId}`}
                  variant="secondary"
                  aria-pressed={active}
                  data-admin-placement-marker={row.placementId}
                  data-placement-domain={row.domain}
                  data-sellable={row.flags.sellable ? "1" : "0"}
                  data-runtime={row.flags.runtimeSupported ? "1" : "0"}
                  data-preview={row.flags.previewSupported ? "1" : "0"}
                  className={`!h-auto w-full !items-stretch !justify-start !whitespace-normal !px-3 !py-3 text-left !font-normal ${
                    active ? "!border-sam-primary !bg-sam-primary/5" : ""
                  }`}
                  onClick={() => setSelectedId(row.placementId)}
                >
                  <div className="flex w-full flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-[12px] font-semibold text-sam-muted">
                        {row.domain === "DELIVERY"
                          ? ko
                            ? "배달"
                            : "Delivery"
                          : row.domain === "FEED"
                            ? ko
                              ? "피드"
                              : "Feed"
                            : ko
                              ? "팝업"
                              : "Popup"}
                        {" · "}
                        {SCREENS.find((s) => s.id === row.screen)
                          ? ko
                            ? SCREENS.find((s) => s.id === row.screen)!.ko
                            : SCREENS.find((s) => s.id === row.screen)!.en
                          : row.screen}
                      </p>
                      <p className="mt-0.5 text-[14px] font-semibold text-sam-fg">
                        {ko ? row.displayNameKo : row.displayNameEn}
                      </p>
                      {occ ? (
                        <p className="mt-1 text-[12px] text-sam-fg">
                          {ko ? "사용" : "Used"} {occ.liveCount}/{occ.capacity}
                          {" · "}
                          {ko ? "빈 자리" : "Vacant"} {occ.vacant}
                          {" · "}
                          {ko ? occ.vacancyLabelKo : occ.vacancyLabelEn}
                        </p>
                      ) : occupancyState === "loading" ? (
                        <p className="mt-1 text-[12px] text-sam-muted" role="status" data-admin-state="loading">
                          {ko ? "점유 불러오는 중…" : "Loading occupancy…"}
                        </p>
                      ) : occupancyState === "unavailable" ? (
                        <p className="mt-1 text-[12px] text-sam-warning">
                          {ko ? "점유 확인 불가" : "Occupancy unavailable"}
                        </p>
                      ) : (
                        <p className="mt-1 text-[12px] text-sam-muted">
                          {ko ? "일정 기반 점유 없음" : "No schedule occupancy"}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <Flag
                        on={row.flags.sellable}
                        labelKo="판매 가능"
                        labelEn="Sellable"
                        ko={ko}
                      />
                      <Flag
                        on={row.flags.runtimeSupported}
                        labelKo="앱 연결"
                        labelEn="App linked"
                        ko={ko}
                      />
                    </div>
                  </div>
                </AdminActionButton>
              );
            })
          )}
        </div>

        <AdminCard
          title={safeT("admin_placement_map_detail", {
            fallbackKo: "지면 상세",
            fallbackEn: "Placement detail",
          })}
        >
          <div data-admin-placement-map-detail="1">
            {!selected ? (
              <p className="text-[13px] text-sam-muted">
                {safeT("admin_placement_map_select_hint", {
                  fallbackKo: "왼쪽에서 지면을 선택하세요.",
                  fallbackEn: "Select a placement on the left.",
                })}
              </p>
            ) : (
              <div className="space-y-3 text-[12px] text-sam-fg">
                <div>
                  <p className="font-semibold text-[14px]">
                    {ko ? selected.displayNameKo : selected.displayNameEn}
                  </p>
                  {occupancyByKey[selected.placementId] ? (
                    <p className="mt-1 text-[13px]">
                      {ko ? "용량" : "Capacity"}{" "}
                      {occupancyByKey[selected.placementId]!.liveCount}/
                      {occupancyByKey[selected.placementId]!.capacity}
                      {" · "}
                      {ko ? "예약" : "Reserved"}{" "}
                      {occupancyByKey[selected.placementId]!.reservedCount}
                      {" · "}
                      {ko ? "빈 자리" : "Vacant"} {occupancyByKey[selected.placementId]!.vacant}
                    </p>
                  ) : null}
                </div>
                {mini ? (
                  <DeliveryAdPlacementMiniature
                    kind={mini}
                    adLabel={ko ? "광고" : "Ad"}
                  />
                ) : null}
                <ul className="space-y-1">
                  <li>
                    {ko ? "상품" : "Product"}: {selected.productKind}
                  </li>
                  <li>
                    {ko ? "비율" : "Ratio"}: {selected.aspectRatio}
                  </li>
                  <li>
                    {ko ? "앱 경로" : "App route"}: {selected.runtimeRouteHint}
                  </li>
                  <li className="text-sam-muted">{selected.notes}</li>
                </ul>
                <details className="rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1.5">
                  <summary className="cursor-pointer text-[12px] font-semibold text-sam-muted">
                    {ko ? "기술 정보 보기" : "Technical info"}
                  </summary>
                  <ul className="mt-2 space-y-1 font-mono text-[12px] text-sam-muted">
                    <li>{selected.placementId}</li>
                    <li>
                      {ko ? "비율 권한" : "Ratio owner"}: {selected.ratioOwner}
                    </li>
                    <li>
                      {ko ? "런타임" : "Runtime"}: {selected.runtimeConsumer}
                    </li>
                    <li>
                      Preview: {selected.flags.previewSupported ? "Y" : "N"}
                    </li>
                  </ul>
                </details>
                {!selected.flags.sellable && selected.flags.runtimeSupported ? (
                  <p className="rounded-ui-rect border border-sam-warning bg-sam-warning-soft px-2 py-1.5 text-[12px] font-semibold text-sam-fg">
                    {safeT("admin_placement_map_defined_not_sellable", {
                      fallbackKo:
                        "이 지면은 정의·앱 연결은 있으나 현재 판매 대상이 아닙니다.",
                      fallbackEn:
                        "Defined and app-linked, but not sellable at launch.",
                    })}
                  </p>
                ) : null}
                {!selected.flags.runtimeSupported ? (
                  <p className="rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1.5 text-[12px] text-sam-muted">
                    {safeT("admin_placement_map_no_runtime", {
                      fallbackKo: "앱 연결 없음 또는 미래/차단 지면입니다.",
                      fallbackEn: "No app consumer, or future/blocked placement.",
                    })}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2 pt-1">
                  <AdminActionLink href={selected.opsHref} size="sm" data-placement-cta="ops">
                    {safeT("admin_placement_map_cta_ops", {
                      fallbackKo: "광고 운영 보기",
                      fallbackEn: "Open ads ops",
                    })}
                  </AdminActionLink>
                  {selected.configHref ? (
                    <AdminActionLink
                      href={selected.configHref}
                      size="sm"
                      data-placement-cta="config"
                    >
                      {safeT("admin_placement_map_cta_config", {
                        fallbackKo: "유기 설정 보기",
                        fallbackEn: "Open organic config",
                      })}
                    </AdminActionLink>
                  ) : null}
                  <AdminActionLink
                    href={selected.adminController}
                    size="sm"
                    data-placement-cta="admin"
                  >
                    {safeT("admin_placement_map_cta_admin", {
                      fallbackKo: "Admin 허브",
                      fallbackEn: "Admin hub",
                    })}
                  </AdminActionLink>
                </div>
              </div>
            )}
          </div>
        </AdminCard>
      </div>
    </section>
  );
}
