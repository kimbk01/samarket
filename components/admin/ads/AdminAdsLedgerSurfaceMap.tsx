"use client";

/**
 * 위치 지도 — 지면 전체 (설계 ads-admin-ssot-design-2026-11-07 §5 · 2026-11-07).
 * 배달 홈 히어로·중간·업종 상단(업종별)·검색 상단·매장 목록(홈/업종) · 피드 4곳 · 상위노출 2곳 · 팝업 화면 · PTR 화면 · 마이 · 인트로 · 이벤트 히어로.
 * 칸 = 수용량 · 노출 중 · 예약 · 비어 있음 → 누르면 원장이 그 위치로 걸러진다(`/admin/advertising?location=`).
 * 수는 원장 함수(`location_counts`) — 원장 행과 같은 원천.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { fetchAdsControlPlane } from "@/lib/admin/ads-control-plane/fetch-ads-control-plane";
import type { AdsLedgerLocationCount } from "@/lib/admin/ads-control-plane/types";
import { projectLedgerSurfaceMap, type LedgerSurfaceGroup } from "@/lib/admin/ads-exposure/placement-inventory";
import { adLocationLabel } from "@/lib/admin/ads-ledger/ad-location-label";

const GROUP_ORDER: LedgerSurfaceGroup[] = ["delivery", "feed", "boost", "popup", "ptr", "mypage", "intro", "event"];

/** 실기 v6 FAIL 3: 대상별로 나뉘는 지면의 합계 칸은 「업종마다 수용 N」처럼 단위를 붙인다(합계와 1곳 수용량을 나란히 두지 않음) */
function perTargetCapacityKey(
  locationKey: string
):
  | "ads_ledger_map_capacity_each_store_category"
  | "ads_ledger_map_capacity_each_trade_category"
  | "ads_ledger_map_capacity_each_topic" {
  if (locationKey === "COMMUNITY_TOPIC") return "ads_ledger_map_capacity_each_topic";
  if (locationKey === "TRADE_CATEGORY") return "ads_ledger_map_capacity_each_trade_category";
  return "ads_ledger_map_capacity_each_store_category";
}

export function AdminAdsLedgerSurfaceMap({ domain }: { domain?: string | null }) {
  const { language, t } = useI18n();
  const ko = language !== "en";
  const [counts, setCounts] = useState<AdsLedgerLocationCount[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    void fetchAdsControlPlane({ page: { mode: "all", limit: 1, offset: 0, domain: domain || undefined } }).then((r) => {
      if (!alive) return;
      if (!r.ok || !r.plane.page?.ledger) {
        setFailed(true);
        setCounts(null);
        return;
      }
      setFailed(false);
      setCounts(r.plane.locationCounts ?? []);
    });
    return () => {
      alive = false;
    };
  }, [domain]);

  const cells = useMemo(() => (counts ? projectLedgerSurfaceMap(counts) : []), [counts]);

  return (
    <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4" data-admin-ads-ledger-surface-map="1">
      <h2 className="text-[16px] font-semibold text-sam-fg">{t("ads_ledger_map_title")}</h2>
      <p className="mt-1 text-[12px] text-sam-muted">{t("ads_ledger_map_desc")}</p>
      {failed ? (
        <p className="mt-2 text-[12px] text-sam-muted" role="status">
          {t("ads_ledger_map_unavailable")}
        </p>
      ) : null}
      {GROUP_ORDER.map((g) => {
        const list = cells.filter((c) => c.group === g);
        if (list.length === 0) return null;
        return (
          <div key={g} className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-admin-ads-ledger-surface-group={g}>
            {list.map((c) => (
              <Link
                key={`${c.locationKey}|${c.locationTarget ?? ""}`}
                href={c.ledgerHref}
                className="block rounded-ui-rect border border-sam-border p-3 hover:bg-sam-app"
                data-admin-ads-ledger-surface-cell={`${c.locationKey}|${c.locationTarget ?? ""}`}
              >
                <div className="text-[13px] font-medium text-sam-fg">
                  {adLocationLabel(
                    { locationKey: c.locationKey, locationTarget: c.locationTarget, locationTargetName: c.locationTargetName },
                    ko
                  )}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 text-[12px] text-sam-muted tabular-nums">
                  <span data-admin-ads-ledger-surface-capacity={c.capacityPerTarget ? "per-target" : "cell"}>
                    {c.capacity == null
                      ? t("ads_ledger_map_capacity_open")
                      : c.capacityPerTarget
                        ? t(perTargetCapacityKey(c.locationKey), { n: c.capacity })
                        : t("ads_ledger_map_capacity", { n: c.capacity })}
                  </span>
                  <span>{t("ads_ledger_map_live", { n: c.live })}</span>
                  {c.capacityPerTarget && c.liveTargets ? (
                    <span>{t("ads_ledger_map_live_targets", { n: c.liveTargets })}</span>
                  ) : null}
                  {c.waiting > 0 ? <span>{t("ads_ledger_map_waiting", { n: c.waiting })}</span> : null}
                  <span>{t("ads_ledger_map_scheduled", { n: c.scheduled })}</span>
                  {c.vacant != null && c.vacant > 0 ? <span>{t("ads_ledger_map_vacant")}</span> : null}
                </div>
              </Link>
            ))}
          </div>
        );
      })}
    </section>
  );
}
