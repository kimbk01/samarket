"use client";

import { useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AppLanguageCode } from "@/lib/i18n/config";
import type { MessageKey } from "@/lib/i18n/messages";
import { getPromotedItems } from "@/lib/ads/mock-promoted-items";
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
  const items = useMemo(() => getPromotedItems(), []);

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_ads_promoted_page_title" />
      {items.length === 0 ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
          {t("admin_ads_promoted_empty")}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[600px] border-collapse sam-text-body">
            <thead>
              <tr className="border-b border-sam-border bg-sam-app">
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_ads_col_target")}
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_ads_col_placement")}
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_ads_col_status")}
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_ads_col_exposure_period")}
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-sam-border-soft hover:bg-sam-app"
                >
                  <td className="px-3 py-2.5 font-medium text-sam-fg">{p.targetTitle}</td>
                  <td className="px-3 py-2.5 text-sam-fg">{t(PLACEMENT_KEYS[p.placement])}</td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-block rounded px-2 py-0.5 sam-text-helper font-medium ${
                        p.status === "active"
                          ? "bg-signature/10 text-signature"
                          : p.status === "expired"
                            ? "bg-sam-border-soft text-sam-muted"
                            : "bg-sam-surface-muted text-sam-fg"
                      }`}
                    >
                      {t(STATUS_KEYS[p.status])}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                    {new Date(p.startAt).toLocaleDateString(dateLocale)} ~{" "}
                    {new Date(p.endAt).toLocaleDateString(dateLocale)}
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
