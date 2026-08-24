"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminDeliveryCmsChrome } from "@/components/admin/shell/AdminDeliveryCmsChrome";
import { AdminCard } from "@/components/admin/AdminCard";
import {
  AdminStoreBannerAdWriterPanel,
  type AdminStoreBannerAdRow,
} from "@/components/admin/stores/AdminStoreBannerAdWriterPanel";

export function AdminStoreBannerAdsPage() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<AdminStoreBannerAdRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/store-banner-ads", {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        campaigns?: AdminStoreBannerAdRow[];
      };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "banner_ads_load_error");
        setCampaigns([]);
        return;
      }
      setCampaigns(json.campaigns ?? []);
    } catch {
      setError("banner_ads_load_error");
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stateLabel = (state: AdminStoreBannerAdRow["computed_state"]) => {
    switch (state) {
      case "active":
        return "ACTIVE";
      case "scheduled":
        return "SCHEDULED";
      case "expired":
        return "EXPIRED";
      case "invalid_creative":
        return "INVALID_CREATIVE";
      default:
        return "INACTIVE";
    }
  };

  return (
    <AdminDeliveryCmsChrome>
      <AdminCard titleKey="admin_store_banner_ads_title">
        <p className="mb-3 text-[13px] text-sam-muted">{t("admin_store_banner_ads_desc")}</p>
        <AdminStoreBannerAdWriterPanel
          campaigns={campaigns}
          loading={loading}
          error={error}
          onRefresh={() => void load()}
          stateLabel={stateLabel}
        />
      </AdminCard>
    </AdminDeliveryCmsChrome>
  );
}
