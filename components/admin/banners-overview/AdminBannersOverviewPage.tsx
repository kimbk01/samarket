"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import {
  PROMOTION_OPERATOR_STATUSES,
  promotionOperatorStatusLabel,
  promotionOperatorStatusTone,
  type PromotionOperatorStatus,
} from "@/lib/admin/promotion-operation-status";
import {
  mapDeliveryBanner,
  mapFeedCampaign,
  mapMypageBanner,
  mapPromotionBanner,
  sortBannerOverviewRows,
  type BannerOverviewKind,
  type BannerOverviewRow,
  type DeliveryBannerInput,
  type FeedCampaignInput,
  type MypageBannerInput,
  type PromotionBannerInput,
} from "@/lib/admin/banners-overview/banner-overview-model";
import type { MessageKey } from "@/lib/i18n/messages";

const KINDS: BannerOverviewKind[] = ["mypage", "promotion", "feed", "delivery"];
const KIND_KEY: Record<BannerOverviewKind, MessageKey> = {
  mypage: "admin_banners_overview_kind_mypage",
  promotion: "admin_banners_overview_kind_promotion",
  feed: "admin_banners_overview_kind_feed",
  delivery: "admin_banners_overview_kind_delivery",
};
const POLICY_KEY: Record<BannerOverviewKind, MessageKey> = {
  mypage: "admin_banners_overview_policy_mypage",
  promotion: "admin_banners_overview_policy_promotion",
  feed: "admin_banners_overview_policy_feed",
  delivery: "admin_banners_overview_policy_delivery",
};
const DOMAIN_KEY: Record<BannerOverviewRow["domain"], MessageKey> = {
  common: "admin_banners_overview_domain_common",
  trade: "admin_banners_overview_domain_trade",
  community: "admin_banners_overview_domain_community",
  delivery: "admin_banners_overview_domain_delivery",
};

type SourceResult = { kind: BannerOverviewKind; rows: BannerOverviewRow[]; failed: boolean };

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: "no-store", credentials: "include" });
    const j = (await res.json().catch(() => null)) as (T & { ok?: boolean }) | null;
    if (!res.ok || !j || j.ok === false) return null;
    return j;
  } catch {
    return null;
  }
}

/** 각 원장의 기존 관리자 GET API 만 읽는다 (쓰기 없음). 한 곳이 실패해도 나머지는 보인다. */
async function loadAllSources(nowMs: number): Promise<SourceResult[]> {
  const [my, promo, feed, delivery] = await Promise.all([
    getJson<{ banners?: MypageBannerInput[] }>("/api/admin/banners"),
    getJson<{ items?: PromotionBannerInput[] }>("/api/admin/platform-promotion/banners?limit=100&offset=0"),
    getJson<{ campaigns?: FeedCampaignInput[] }>("/api/admin/feed-ads"),
    getJson<{ campaigns?: DeliveryBannerInput[] }>("/api/admin/delivery-ads?product=banner&view=all&limit=100&offset=0"),
  ]);
  return [
    { kind: "mypage", failed: !my, rows: (my?.banners ?? []).map((b) => mapMypageBanner(b, nowMs)) },
    { kind: "promotion", failed: !promo, rows: (promo?.items ?? []).map((r) => mapPromotionBanner(r, nowMs)) },
    { kind: "feed", failed: !feed, rows: (feed?.campaigns ?? []).map((c) => mapFeedCampaign(c, nowMs)) },
    { kind: "delivery", failed: !delivery, rows: (delivery?.campaigns ?? []).map((d) => mapDeliveryBanner(d, nowMs)) },
  ];
}

export function AdminBannersOverviewPage() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const lang = ko ? "ko" : "en";
  const [sources, setSources] = useState<SourceResult[] | null>(null);
  const [kind, setKind] = useState<BannerOverviewKind | "all">("all");
  const [status, setStatus] = useState<PromotionOperatorStatus | "all">("all");

  const load = useCallback(async () => {
    setSources(null);
    setSources(await loadAllSources(Date.now()));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    const all = (sources ?? []).flatMap((s) => s.rows);
    return sortBannerOverviewRows(
      all.filter((r) => (kind === "all" || r.kind === kind) && (status === "all" || r.status === status))
    );
  }, [sources, kind, status]);

  const failedKinds = (sources ?? []).filter((s) => s.failed).map((s) => s.kind);
  const TH = "px-3 py-2.5 text-left text-xs font-medium text-sam-muted";
  const TD = "px-3 py-2.5 align-top sam-text-body text-sam-fg";
  const SELECT = "h-10 rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 text-[14px] text-sam-fg";
  const period = (r: BannerOverviewRow) =>
    `${r.startAt ? formatAdminManilaDateTime(r.startAt) : "—"} – ${r.endAt ? formatAdminManilaDateTime(r.endAt) : "—"}`;

  return (
    <div data-admin-banners-overview="1">
      <AdminPageHeader titleKey="admin_menu_ads_banners_overview" descriptionKey="admin_banners_overview_desc" />
      <div className="mb-3 flex flex-wrap items-end gap-3" role="search">
        <label className="flex flex-col gap-1 text-[12px] font-medium text-sam-muted">
          {t("admin_banners_overview_filter_kind")}
          <select className={SELECT} value={kind} onChange={(e) => setKind(e.target.value as BannerOverviewKind | "all")}>
            <option value="all">{t("admin_banners_overview_filter_all")}</option>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {t(KIND_KEY[k])}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-medium text-sam-muted">
          {t("admin_banners_overview_col_status")}
          <select className={SELECT} value={status} onChange={(e) => setStatus(e.target.value as PromotionOperatorStatus | "all")}>
            <option value="all">{t("admin_banners_overview_filter_all")}</option>
            {PROMOTION_OPERATOR_STATUSES.map((s) => (
              <option key={s} value={s}>
                {promotionOperatorStatusLabel(s, lang)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {failedKinds.length > 0 ? (
        <p className="mb-3 rounded-ui-rect border border-sam-warning bg-sam-warning-soft px-3 py-2 sam-text-body text-sam-fg" role="status">
          {t("admin_banners_overview_source_failed")}: {failedKinds.map((k) => t(KIND_KEY[k])).join(", ")}
        </p>
      ) : null}
      {sources == null ? (
        <AdminLoadingState ko={ko} />
      ) : failedKinds.length === KINDS.length ? (
        <AdminErrorState ko={ko} code="load_failed" onRetry={() => void load()} />
      ) : rows.length === 0 ? (
        <AdminEmptyState ko={ko} message={ko ? "조건에 맞는 배너가 없습니다." : "No banners match."} />
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[1080px] border-collapse sam-text-body">
            <thead className="border-b border-sam-border bg-sam-app">
              <tr>
                <th className={TH}>{t("admin_banners_overview_col_kind")}</th>
                <th className={TH}>{ko ? "제목" : "Title"}</th>
                <th className={TH}>{t("admin_banners_overview_col_domain")}</th>
                <th className={TH}>{t("admin_banners_overview_col_surface")}</th>
                <th className={TH}>{t("admin_banners_overview_col_status")}</th>
                <th className={TH}>{t("admin_banners_overview_col_period")} (PHT)</th>
                <th className={TH}>{t("admin_banners_overview_col_creative")}</th>
                <th className={TH}>{t("admin_banners_overview_col_policy")}</th>
                <th className={TH}>{t("admin_banners_overview_col_actions")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b border-sam-border last:border-b-0" data-admin-banner-kind={r.kind}>
                  <td className={`${TD} whitespace-nowrap`}>{t(KIND_KEY[r.kind])}</td>
                  <td className={TD}>
                    <div className="flex items-center gap-2">
                      {r.thumbUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- admin list thumb
                        <img src={r.thumbUrl} alt="" className="h-9 w-14 shrink-0 rounded object-cover" />
                      ) : (
                        <span className="h-9 w-14 shrink-0 rounded bg-sam-app" />
                      )}
                      <span className="min-w-0 font-medium">{r.title}</span>
                    </div>
                  </td>
                  <td className={`${TD} whitespace-nowrap`}>{t(DOMAIN_KEY[r.domain])}</td>
                  <td className={`${TD} text-sam-muted`}>{r.surface}</td>
                  <td className={TD}>
                    <AdminToneBadge tone={promotionOperatorStatusTone(r.status)}>
                      {promotionOperatorStatusLabel(r.status, lang)}
                    </AdminToneBadge>
                  </td>
                  <td className={`${TD} whitespace-nowrap text-sam-muted`}>{period(r)}</td>
                  <td className={`${TD} text-sam-muted`}>{r.creative}</td>
                  <td className={`${TD} text-sam-muted`}>{t(POLICY_KEY[r.kind])}</td>
                  <td className={TD}>
                    <div className="flex flex-wrap gap-1.5">
                      {r.editable ? (
                        <AdminActionLink href={r.editHref} variant="secondary" size="sm">
                          {t("admin_banners_overview_edit")}
                        </AdminActionLink>
                      ) : null}
                      <AdminActionLink href={r.customerHref} variant="neutral" size="sm" target="_blank" rel="noopener noreferrer">
                        {t("admin_banners_overview_open_customer")}
                      </AdminActionLink>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
