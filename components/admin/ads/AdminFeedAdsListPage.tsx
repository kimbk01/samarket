"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import type { FeedAdCampaignView } from "@/lib/ads/feed-ad-placement";

/**
 * Admin Feed Advertisement list — Campaign authority (no D-Point/Business Credit debit).
 */
export function AdminFeedAdsListPage() {
  const { t, safeT } = useI18n();
  const [campaigns, setCampaigns] = useState<FeedAdCampaignView[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/feed-ads", { cache: "no-store" });
      const j = (await res.json()) as { campaigns?: FeedAdCampaignView[] };
      setCampaigns(j.campaigns ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_menu_ads_feed" />
      <div className="flex justify-end">
        <a
          href="/admin/feed-ads/new"
          className="rounded-ui-rect bg-signature px-3 py-2 sam-text-body font-medium text-white"
        >
          {safeT("admin_feed_ads_create", {
            fallbackKo: "광고 만들기",
            fallbackEn: "Create ad",
          })}
        </a>
      </div>
      <p className="sam-text-body-secondary text-sam-muted">
        {safeT("admin_feed_ads_hint", {
          fallbackKo:
            "Trade / Community 피드 배너 캠페인입니다. 회원 D-Point·매장 Business Credit을 차감하지 않습니다.",
          fallbackEn:
            "Trade/Community feed banner campaigns. Does not debit member D-Point or store Business Credit.",
        })}
      </p>
      {loading ? (
        <p className="py-8 text-center text-sam-muted">{t("common_loading")}</p>
      ) : campaigns.length === 0 ? (
        <p className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center text-sam-muted">
          {safeT("admin_feed_ads_empty", {
            fallbackKo: "등록된 피드 광고가 없습니다.",
            fallbackEn: "No feed ad campaigns yet.",
          })}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[640px] border-collapse sam-text-body">
            <thead>
              <tr className="border-b border-sam-border bg-sam-app">
                <th className="px-3 py-2 text-left">
                  {safeT("admin_feed_ads_col_name", { fallbackKo: "이름", fallbackEn: "Name" })}
                </th>
                <th className="px-3 py-2 text-left">
                  {safeT("admin_feed_ads_col_placement", {
                    fallbackKo: "위치",
                    fallbackEn: "Placement",
                  })}
                </th>
                <th className="px-3 py-2 text-left">
                  {safeT("admin_feed_ads_col_status", {
                    fallbackKo: "상태",
                    fallbackEn: "Status",
                  })}
                </th>
                <th className="px-3 py-2 text-left">
                  {safeT("admin_feed_ads_col_slides", {
                    fallbackKo: "슬라이드",
                    fallbackEn: "Slides",
                  })}
                </th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id} className="border-b border-sam-border-soft">
                  <td className="px-3 py-2 font-medium">{c.name || c.id}</td>
                  <td className="px-3 py-2">
                    {c.domain}/{c.placement}
                    {c.targetCategoryId ? ` · ${c.targetCategoryId}` : ""}
                    {c.targetTopicSlug ? ` · ${c.targetTopicSlug}` : ""}
                  </td>
                  <td className="px-3 py-2">{c.status}</td>
                  <td className="px-3 py-2">{c.slides.length}/3</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
