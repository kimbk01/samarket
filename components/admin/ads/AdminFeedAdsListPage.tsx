"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import type { FeedAdCampaignView, FeedAdPlacement } from "@/lib/ads/feed-ad-placement";
import { feedAdPlacementHumanLabel } from "@/lib/ads/feed-ad-placement";
import {
  adsDisplayTitle,
  adsRemainingPeriodLabel,
  deriveAdsOperatorExposure,
  adsOperatorExposureLabel,
  formatAdsPeriod,
  isAdsTestFixtureLabel,
} from "@/lib/admin/ads-operator/ads-operator-presentation";

type OpsFilter = "actionable" | "live" | "scheduled" | "ended" | "all" | "test";

/**
 * Feed Ads operator list — presentation over feed_ad_campaigns.
 * Lifecycle end/approve live on request queue; list links to applications + create.
 */
export function AdminFeedAdsListPage() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const [campaigns, setCampaigns] = useState<FeedAdCampaignView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<"network" | "unavailable" | null>(null);
  const [filter, setFilter] = useState<OpsFilter>("actionable");
  const lang = language === "en" ? "en" : "ko";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/feed-ads", { cache: "no-store" });
      const j = (await res.json().catch(() => ({}))) as { campaigns?: FeedAdCampaignView[]; error?: string };
      if (!res.ok) {
        setCampaigns([]);
        setError("unavailable");
        return;
      }
      setCampaigns(Array.isArray(j.campaigns) ? j.campaigns : []);
    } catch {
      setCampaigns([]);
      setError("network");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    const now = Date.now();
    return campaigns.map((c) => {
      const exposure = deriveAdsOperatorExposure({
        lifecycle: c.status,
        startAt: c.startAt,
        endAt: c.endAt,
        eligibleNow: c.status === "active",
        nowMs: now,
      });
      const test = isAdsTestFixtureLabel(c.name);
      return { c, exposure, test };
    });
  }, [campaigns]);

  const filtered = useMemo(() => {
    return rows.filter(({ c, exposure, test }) => {
      if (filter === "test") return test;
      if (filter === "all") return !test || filter === "all";
      if (filter === "actionable") {
        // Ops default: needs attention — not live exposing, not ended dump.
        return (
          !test &&
          exposure !== "exposing" &&
          exposure !== "ended" &&
          c.status !== "ended"
        );
      }
      if (filter === "live") return !test && exposure === "exposing";
      if (filter === "scheduled") return !test && exposure === "scheduled";
      if (filter === "ended") return exposure === "ended" || c.status === "ended";
      return true;
    });
  }, [rows, filter]);

  const filters: { id: OpsFilter; ko: string; en: string }[] = [
    { id: "actionable", ko: "운영 기본", en: "Ops default" },
    { id: "live", ko: "노출 중", en: "Live" },
    { id: "scheduled", ko: "예약", en: "Scheduled" },
    { id: "ended", ko: "종료 / 이력", en: "Ended / history" },
    { id: "test", ko: "테스트 데이터", en: "Test data" },
    { id: "all", ko: "전체", en: "All" },
  ];

  return (
    <div className="space-y-4" data-admin-feed-ads-ops="1">
      <AdminPageHeader titleKey="admin_menu_ads_feed" />
      <p className="sam-text-body-secondary text-sam-muted">
        {ko
          ? "피드 배너 기존 상품별 목록입니다. 통합 신청은 광고 신청, 승인 후 운영은 노출 관리에서 처리합니다."
          : "Legacy product-scoped Feed banner list. Use Applications for requests and Operations for approved campaigns."}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`rounded-ui-rect border px-3 py-1.5 text-sm font-semibold ${
                filter === f.id
                  ? "border-sam-ink bg-sam-ink text-white"
                  : "border-sam-border bg-sam-surface text-sam-fg"
              }`}
              onClick={() => setFilter(f.id)}
            >
              {ko ? f.ko : f.en}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/advertising/applications"
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body font-semibold text-sam-fg"
          >
            {ko ? "광고 신청" : "Applications"}
          </Link>
          <Link
            href="/admin/advertising/operations"
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body font-semibold text-sam-fg"
          >
            {ko ? "노출 관리" : "Operations"}
          </Link>
          <a
            href="/admin/feed-ads/new"
            className="rounded-ui-rect bg-signature px-3 py-2 sam-text-body font-medium text-white"
          >
            {ko ? "피드 광고 등록" : "Create feed ad"}
          </a>
        </div>
      </div>

      {loading ? (
        <p className="py-8 text-center text-sam-muted">{t("common_loading")}</p>
      ) : error ? (
        <p className="rounded-ui-rect border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950" data-admin-feed-ads-error="1">
          {ko ? "피드 광고를 불러오지 못했습니다. (UNAVAILABLE)" : "Could not load feed ads (UNAVAILABLE)."}
        </p>
      ) : filtered.length === 0 ? (
        <p className="rounded-ui-rect border border-dashed border-sam-border bg-sam-surface py-12 text-center text-sam-muted">
          {ko ? "해당 조건의 광고가 없습니다." : "No ads for this filter."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[960px] border-collapse sam-text-body">
            <thead>
              <tr className="border-b border-sam-border bg-sam-app text-sam-muted">
                <th className="px-3 py-2 text-left">{ko ? "상태" : "Status"}</th>
                <th className="px-3 py-2 text-left">{ko ? "광고" : "Ad"}</th>
                <th className="px-3 py-2 text-left">{ko ? "도메인 · 지면" : "Domain · placement"}</th>
                <th className="px-3 py-2 text-left">{ko ? "기간 · 남음" : "Period"}</th>
                <th className="px-3 py-2 text-left">{ko ? "실제 노출" : "Exposure"}</th>
                <th className="px-3 py-2 text-left">{ko ? "슬라이드" : "Slides"}</th>
                <th className="px-3 py-2 text-left">{ko ? "조치" : "Action"}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(({ c, exposure, test }) => {
                const domain =
                  c.placement.startsWith("COMMUNITY") ? (ko ? "커뮤니티" : "Community") : ko ? "거래" : "Trade";
                const placement = feedAdPlacementHumanLabel(c.placement as FeedAdPlacement, lang);
                return (
                  <tr key={c.id} className="border-b border-sam-border-soft" data-feed-ad-id={c.id}>
                    <td className="px-3 py-2">
                      <span className="rounded-full bg-sam-app px-2 py-0.5 sam-text-xxs font-semibold">
                        {adsOperatorExposureLabel(exposure, ko)}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-medium">
                      {adsDisplayTitle(c.name, ko)}
                      {test ? (
                        <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 sam-text-xxs text-amber-950">
                          {ko ? "테스트" : "Test"}
                        </span>
                      ) : null}
                      <div className="sam-text-xxs text-sam-muted">
                        {c.source === "MEMBER_REQUESTED"
                          ? ko
                            ? "회원 신청"
                            : "Member request"
                          : ko
                            ? "관리자 직접"
                            : "Admin direct"}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {domain} · {placement}
                    </td>
                    <td className="px-3 py-2 sam-text-xxs">
                      <div>{formatAdsPeriod(c.startAt, c.endAt, ko ? "ko-KR" : "en-US")}</div>
                      <div className="text-sam-muted">{adsRemainingPeriodLabel(c.startAt, c.endAt, ko)}</div>
                    </td>
                    <td className="px-3 py-2">{adsOperatorExposureLabel(exposure, ko)}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {c.slides.length}/3
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col gap-1">
                        <Link
                          href="/admin/ad-applications?domain=feed"
                          className="font-semibold text-signature hover:underline"
                        >
                          {ko ? "신청 큐에서 관리" : "Manage in request queue"}
                        </Link>
                        {c.requestId ? (
                          <span className="sam-text-xxs text-sam-muted">
                            {ko ? "종료·거절은 신청 상세에서" : "End/reject in request detail"}
                          </span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
