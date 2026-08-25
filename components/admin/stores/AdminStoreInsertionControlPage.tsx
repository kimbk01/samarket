"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminDeliveryCmsChrome } from "@/components/admin/shell/AdminDeliveryCmsChrome";
import { AdminCard } from "@/components/admin/AdminCard";
import {
  AdminStorePaidAdWriterPanel,
  type AdminStorePaidAdRow,
} from "@/components/admin/stores/AdminStorePaidAdWriterPanel";
import { Sam } from "@/lib/ui/sam-component-classes";

type ComputedState = "active" | "upcoming" | "expired" | "inactive";

export function AdminStoreInsertionControlPage() {
  const { t, language } = useI18n();
  const ko = language === "ko";

  const [paidAdsLoading, setPaidAdsLoading] = useState(true);
  const [paidAdsErr, setPaidAdsErr] = useState<string | null>(null);
  const [paidAds, setPaidAds] = useState<AdminStorePaidAdRow[]>([]);

  const loadPaidAds = useCallback(async () => {
    setPaidAdsLoading(true);
    setPaidAdsErr(null);
    try {
      const res = await fetch("/api/admin/store-paid-ads", {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        campaigns?: AdminStorePaidAdRow[];
      };
      if (!res.ok || !json.ok) {
        setPaidAdsErr(json.error ?? "paid_ads_load_error");
        setPaidAds([]);
        return;
      }
      setPaidAds(json.campaigns ?? []);
    } catch {
      setPaidAdsErr("paid_ads_load_error");
      setPaidAds([]);
    } finally {
      setPaidAdsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPaidAds();
  }, [loadPaidAds]);

  const stateLabel = (state: ComputedState) => {
    if (state === "active") return t("admin_store_insertions_state_active");
    if (state === "upcoming") return t("admin_store_insertions_state_upcoming");
    if (state === "expired") return t("admin_store_insertions_state_expired");
    return t("admin_store_insertions_state_inactive");
  };

  return (
    <AdminDeliveryCmsChrome help="home">
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-[12px] text-sam-muted">
              {ko ? "배달 › 광고" : "Delivery › Ads"}
            </p>
            <h1 className="text-[20px] font-bold text-sam-fg">
              {ko ? "광고 관리" : "Ad management"}
            </h1>
          </div>
          <button type="button" className={Sam.btn.secondary} onClick={() => void loadPaidAds()}>
            {t("admin_store_insertions_refresh")}
          </button>
        </div>

        <AdminCard titleKey="admin_store_insertions_paid_ads_title">
          <div className="mb-3">
            <button type="button" className={Sam.btn.secondary} onClick={() => void loadPaidAds()}>
              {t("admin_store_insertions_refresh_paid_ads")}
            </button>
          </div>
          <AdminStorePaidAdWriterPanel
            campaigns={paidAds}
            loading={paidAdsLoading}
            error={paidAdsErr}
            onRefresh={loadPaidAds}
            stateLabel={stateLabel}
          />
        </AdminCard>
      </div>
    </AdminDeliveryCmsChrome>
  );
}
