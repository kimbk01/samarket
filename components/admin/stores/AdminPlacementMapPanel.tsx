"use client";

/**
 * CUT F — Full App Placement Map panel (read-only).
 * Mounted on /admin/delivery-ads/inventory — not a new shell.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminCard } from "@/components/admin/AdminCard";
import { DeliveryAdPlacementMiniature } from "@/components/stores/advertising/DeliveryAdPlacementMiniature";
import {
  filterPlacementMapRows,
  listAllPlacementMapRows,
  PLACEMENT_MAP_HASH,
  type PlacementMapDomain,
  type PlacementMapRow,
  type PlacementMapScreen,
} from "@/lib/admin/placement-map-read-model";
import type { DeliveryAdInventoryKey } from "@/lib/stores/advertising/delivery-ad-inventory";
import type { PlacementMiniatureKind } from "@/lib/stores/advertising/delivery-ad-launch-placement-product";

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
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
        on ? "bg-emerald-100 text-emerald-900" : "bg-sam-app text-sam-muted"
      }`}
    >
      {ko ? labelKo : labelEn}: {on ? "Y" : "N"}
    </span>
  );
}

export function AdminPlacementMapPanel() {
  const { safeT, language } = useI18n();
  const ko = language !== "en";
  const allRows = useMemo(() => listAllPlacementMapRows(), []);
  const [domain, setDomain] = useState<PlacementMapDomain | "ALL">("DELIVERY");
  const [screen, setScreen] = useState<PlacementMapScreen | "ALL">("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const focus = new URLSearchParams(window.location.search).get("focus")?.trim() || "";
    if (!focus) return;
    setSelectedId(focus);
    const row = allRows.find((r) => r.placementId === focus);
    if (row) {
      setDomain(row.domain);
      setScreen(row.screen);
    }
  }, [allRows]);

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
            fallbackKo: "앱 노출 위치 맵 (Placement Map)",
            fallbackEn: "App placement map",
          })}
        </h2>
        <p className="mt-1 text-[12px] text-sam-muted">
          {safeT("admin_placement_map_desc", {
            fallbackKo:
              "Delivery / Feed / Popup 레지스트리를 읽기만 합니다. 새 placement DB·통합 mutation 없음. 활성 건수는 광고 운영 목록에서 확인하세요.",
            fallbackEn:
              "Read-only over Delivery / Feed / Popup registries. No unified placement DB or mutation. Check active counts in ads ops lists.",
          })}
        </p>
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
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-sam-muted">
                        {row.domain} · {row.screen}
                      </p>
                      <p className="mt-0.5 text-[14px] font-semibold text-sam-fg">
                        {ko ? row.displayNameKo : row.displayNameEn}
                      </p>
                      <p className="mt-1 font-mono text-[11px] text-sam-muted">{row.placementId}</p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <Flag
                        on={row.flags.sellable}
                        labelKo="판매"
                        labelEn="Sell"
                        ko={ko}
                      />
                      <Flag
                        on={row.flags.runtimeSupported}
                        labelKo="Runtime"
                        labelEn="Runtime"
                        ko={ko}
                      />
                      <Flag
                        on={row.flags.previewSupported}
                        labelKo="Preview"
                        labelEn="Preview"
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
                  <p className="font-mono text-[11px] text-sam-muted">{selected.placementId}</p>
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
                    {ko ? "비율 권한" : "Ratio owner"}: {selected.ratioOwner}
                  </li>
                  <li>
                    {ko ? "앱 경로" : "App route"}: {selected.runtimeRouteHint}
                  </li>
                  <li>
                    {ko ? "Runtime" : "Runtime"}: {selected.runtimeConsumer}
                  </li>
                  <li className="text-sam-muted">{selected.notes}</li>
                </ul>
                {!selected.flags.sellable && selected.flags.runtimeSupported ? (
                  <p className="rounded-ui-rect border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] font-semibold text-amber-950">
                    {safeT("admin_placement_map_defined_not_sellable", {
                      fallbackKo:
                        "이 지면은 정의·런타임 연결은 있으나 현재 판매 대상이 아닙니다.",
                      fallbackEn:
                        "Defined and runtime-connected, but not sellable at launch.",
                    })}
                  </p>
                ) : null}
                {!selected.flags.runtimeSupported ? (
                  <p className="rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1.5 text-[11px] text-sam-muted">
                    {safeT("admin_placement_map_no_runtime", {
                      fallbackKo: "Runtime 연결 없음 또는 미래/차단 지면입니다.",
                      fallbackEn: "No runtime consumer, or future/blocked placement.",
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
                        fallbackKo: "설정 보기",
                        fallbackEn: "Open config",
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
