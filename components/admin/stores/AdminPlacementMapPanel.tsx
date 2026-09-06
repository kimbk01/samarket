"use client";

/**
 * CUT F — Full App Placement Map panel (read-only).
 * Mounted on /admin/delivery-ads/inventory — not a new shell.
 * CUT I — optional ?execution=campaignId ACTIVE/eligibility panel (domain loaders only).
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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

const BTN =
  "inline-flex min-h-[36px] items-center rounded-ui-rect border border-sam-border bg-sam-app px-3 text-[12px] font-semibold text-sam-fg hover:bg-sam-surface-muted";
const BTN_ON =
  "inline-flex min-h-[36px] items-center rounded-ui-rect border border-[#0A823E] bg-[#0A823E] px-3 text-[12px] font-semibold text-white";

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
  { id: "DELIVERY_SEARCH", ko: "검색", en: "Search" },
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
      className={`inline-flex rounded-ui-rect px-2 py-0.5 text-[10px] font-semibold ${
        on ? "bg-emerald-100 text-emerald-900" : "bg-sam-app text-sam-muted"
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
      ? "text-emerald-800"
      : ok === false
        ? "text-red-800"
        : "text-sam-fg";
  return (
    <li className={`flex flex-wrap justify-between gap-2 ${tone}`}>
      <span className="text-sam-muted">{label}</span>
      <span className="font-mono text-[11px] font-semibold">{value}</span>
    </li>
  );
}

export function AdminPlacementMapPanel() {
  const { safeT, language } = useI18n();
  const ko = language !== "en";
  const allRows = useMemo(() => listAllPlacementMapRows(), []);
  const [domain, setDomain] = useState<PlacementMapDomain | "ALL">("DELIVERY");
  const [screen, setScreen] = useState<PlacementMapScreen | "ALL">("ALL");
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

  useEffect(() => {
    let cancelled = false;
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
          setOccupancyByKey({});
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const focus = params.get("focus")?.trim() || "";
    const execution = params.get("execution")?.trim() || "";
    if (focus) {
      setSelectedId(focus);
      const row = allRows.find((r) => r.placementId === focus);
      if (row) {
        setDomain(row.domain);
        setScreen(row.screen);
      }
    }
    if (execution) setExecutionId(execution);
  }, [allRows]);

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
  }, [executionId, selectedId]);

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
          <p className="mt-2 text-[12px] font-semibold text-amber-900">
            {ko
              ? "점유 정보를 불러올 수 없습니다. 빈 자리 0으로 간주하지 마세요."
              : "Occupancy unavailable — do not treat as vacancy 0."}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2" data-admin-placement-map-domain="1">
        {DOMAINS.map((d) => (
          <button
            key={d.id}
            type="button"
            className={domain === d.id ? BTN_ON : BTN}
            onClick={() => {
              setDomain(d.id);
              setScreen("ALL");
            }}
          >
            {ko ? d.ko : d.en}
          </button>
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
          <button
            key={s.id}
            type="button"
            className={screen === s.id ? BTN_ON : BTN}
            onClick={() => setScreen(s.id)}
          >
            {ko ? s.ko : s.en}
          </button>
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
            {executionLoading ? (
              <p className="text-sam-muted">{ko ? "불러오는 중…" : "Loading…"}</p>
            ) : null}
            {executionError ? (
              <p className="text-red-800" data-admin-placement-map-active-error="1">
                {executionError}
              </p>
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
                  <li key={n} className="text-[11px] text-sam-muted">
                    {n}
                  </li>
                ))}
                {executionSnap.creativeAssetPath ? (
                  <div data-admin-placement-map-creative="1">
                    <p className="mb-1 text-[11px] font-medium text-sam-muted">
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
            <p className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 text-[13px] text-sam-muted">
              {safeT("admin_placement_map_empty", {
                fallbackKo: "이 화면에는 광고 지면이 없습니다.",
                fallbackEn: "No ad placements on this screen.",
              })}
            </p>
          ) : (
            rows.map((row) => {
              const active = selectedId === row.placementId;
              const occ = occupancyByKey[row.placementId];
              return (
                <button
                  key={`${row.domain}:${row.placementId}`}
                  type="button"
                  data-admin-placement-marker={row.placementId}
                  data-placement-domain={row.domain}
                  data-sellable={row.flags.sellable ? "1" : "0"}
                  data-runtime={row.flags.runtimeSupported ? "1" : "0"}
                  data-preview={row.flags.previewSupported ? "1" : "0"}
                  className={`w-full rounded-ui-rect border px-3 py-3 text-left transition ${
                    active
                      ? "border-[#0A823E] bg-[#0A823E]/5"
                      : "border-sam-border bg-sam-surface hover:border-[#0A823E]/40"
                  }`}
                  onClick={() => setSelectedId(row.placementId)}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-[11px] font-semibold text-sam-muted">
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
                        <p className="mt-1 text-[12px] text-sam-muted">
                          {ko ? "점유 불러오는 중…" : "Loading occupancy…"}
                        </p>
                      ) : occupancyState === "unavailable" ? (
                        <p className="mt-1 text-[12px] text-amber-900">
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
                </button>
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
                  <summary className="cursor-pointer text-[11px] font-semibold text-sam-muted">
                    {ko ? "기술 정보 보기" : "Technical info"}
                  </summary>
                  <ul className="mt-2 space-y-1 font-mono text-[11px] text-sam-muted">
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
                  <p className="rounded-ui-rect border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] font-semibold text-amber-950">
                    {safeT("admin_placement_map_defined_not_sellable", {
                      fallbackKo:
                        "이 지면은 정의·앱 연결은 있으나 현재 판매 대상이 아닙니다.",
                      fallbackEn:
                        "Defined and app-linked, but not sellable at launch.",
                    })}
                  </p>
                ) : null}
                {!selected.flags.runtimeSupported ? (
                  <p className="rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1.5 text-[11px] text-sam-muted">
                    {safeT("admin_placement_map_no_runtime", {
                      fallbackKo: "앱 연결 없음 또는 미래/차단 지면입니다.",
                      fallbackEn: "No app consumer, or future/blocked placement.",
                    })}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2 pt-1">
                  <Link href={selected.opsHref} className={BTN} data-placement-cta="ops">
                    {safeT("admin_placement_map_cta_ops", {
                      fallbackKo: "광고 운영 보기",
                      fallbackEn: "Open ads ops",
                    })}
                  </Link>
                  {selected.configHref ? (
                    <Link
                      href={selected.configHref}
                      className={BTN}
                      data-placement-cta="config"
                    >
                      {safeT("admin_placement_map_cta_config", {
                        fallbackKo: "유기 설정 보기",
                        fallbackEn: "Open organic config",
                      })}
                    </Link>
                  ) : null}
                  <Link
                    href={selected.adminController}
                    className={BTN}
                    data-placement-cta="admin"
                  >
                    {safeT("admin_placement_map_cta_admin", {
                      fallbackKo: "Admin 허브",
                      fallbackEn: "Admin hub",
                    })}
                  </Link>
                </div>
              </div>
            )}
          </div>
        </AdminCard>
      </div>
    </section>
  );
}
