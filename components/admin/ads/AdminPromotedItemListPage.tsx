"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AppLanguageCode } from "@/lib/i18n/config";
import type { MessageKey } from "@/lib/i18n/messages";
import type { AdPlacement, PromotedItem } from "@/lib/types/ad-application";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

const PLACEMENT_KEYS = {
  home_top: "admin_ads_placement_home_top",
  home_middle: "admin_ads_placement_home_middle",
  search_top: "admin_ads_placement_search_top",
  product_detail: "admin_ads_placement_product_detail",
  shop_featured: "admin_ads_placement_shop_featured",
} as const satisfies Record<AdPlacement, MessageKey>;

const STATUS_KEYS = {
  scheduled: "admin_ads_promoted_scheduled",
  active: "admin_ads_promoted_active",
  expired: "admin_ads_promoted_expired",
  paused: "admin_ads_promoted_paused",
} as const satisfies Record<PromotedItem["status"], MessageKey>;

function dateLocaleTag(language: AppLanguageCode): string {
  return language === "en" ? "en-US" : "ko-KR";
}

export function AdminPromotedItemListPage() {
  const { t, language } = useI18n();
  const dateLocale = dateLocaleTag(language);
  const [items, setItems] = useState<PromotedItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/promoted-items", { cache: "no-store" });
      const j = (await res.json()) as { items?: PromotedItem[] };
      setItems(j.items ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_ads_promoted_page_title" />
      {loading ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
          {t("common_loading")}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
          {t("admin_ads_promoted_empty")}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[640px] border-collapse sam-text-body">
            <thead>
              <tr className="border-b border-sam-border bg-sam-app">
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_ads_col_target")}
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_ads_label_placement")}
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_ads_label_application_status")}
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_ads_label_exposure_period")}
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-sam-border-soft hover:bg-sam-app"
                >
                  <td className="px-3 py-2.5 font-medium text-sam-fg">{item.targetTitle}</td>
                  <td className="px-3 py-2.5 text-sam-fg">{t(PLACEMENT_KEYS[item.placement])}</td>
                  <td className="px-3 py-2.5">
                    <span className="inline-block rounded bg-sam-surface-muted px-2 py-0.5 sam-text-helper font-medium text-sam-fg">
                      {t(STATUS_KEYS[item.status])}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                    {new Date(item.startAt).toLocaleString(dateLocale)}
                    {" ~ "}
                    {new Date(item.endAt).toLocaleString(dateLocale)}
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
