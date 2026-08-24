"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminDeliveryCmsChrome } from "@/components/admin/shell/AdminDeliveryCmsChrome";
import { AdminCard } from "@/components/admin/AdminCard";
import {
  AdminStorePaidAdWriterPanel,
  type AdminStorePaidAdRow,
} from "@/components/admin/stores/AdminStorePaidAdWriterPanel";
import {
  AdminStoreCouponWriterPanel,
  type AdminStoreCouponRow,
} from "@/components/admin/stores/AdminStoreCouponWriterPanel";
import { Sam } from "@/lib/ui/sam-component-classes";

type ComputedState = "active" | "upcoming" | "expired" | "inactive";

export function AdminStoreInsertionControlPage() {
  const { t, language } = useI18n();
  const ko = language === "ko";
  const searchParams = useSearchParams();
  const focus = (searchParams.get("focus") || "ads").toLowerCase();
  const showAds = focus !== "coupons";
  const showCoupons = focus !== "ads";

  const [paidAdsLoading, setPaidAdsLoading] = useState(true);
  const [paidAdsErr, setPaidAdsErr] = useState<string | null>(null);
  const [paidAds, setPaidAds] = useState<AdminStorePaidAdRow[]>([]);

  const [couponsLoading, setCouponsLoading] = useState(true);
  const [couponsErr, setCouponsErr] = useState<string | null>(null);
  const [coupons, setCoupons] = useState<AdminStoreCouponRow[]>([]);

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

  const loadCoupons = useCallback(async () => {
    setCouponsLoading(true);
    setCouponsErr(null);
    try {
      const res = await fetch("/api/admin/store-coupons", {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        campaigns?: AdminStoreCouponRow[];
      };
      if (!res.ok || !json.ok) {
        setCouponsErr(json.error ?? "coupons_load_error");
        setCoupons([]);
        return;
      }
      setCoupons(json.campaigns ?? []);
    } catch {
      setCouponsErr("coupons_load_error");
      setCoupons([]);
    } finally {
      setCouponsLoading(false);
    }
  }, []);

  const refreshAll = useCallback(() => {
    void loadPaidAds();
    void loadCoupons();
  }, [loadPaidAds, loadCoupons]);

  useEffect(() => {
    void loadPaidAds();
    void loadCoupons();
  }, [loadPaidAds, loadCoupons]);

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
              {ko ? "배달 › 광고/쿠폰" : "Delivery › Ads / Coupons"}
            </p>
            <h1 className="text-[20px] font-bold text-sam-fg">
              {focus === "coupons"
                ? ko ? "쿠폰 관리" : "Coupon management"
                : focus === "ads"
                  ? ko ? "광고 관리" : "Ad management"
                  : t("admin_store_insertions_title")}
            </h1>
          </div>
          <button type="button" className={Sam.btn.secondary} onClick={refreshAll}>
            {t("admin_store_insertions_refresh")}
          </button>
        </div>

        {showAds ?
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
        : null}

        {showCoupons ?
          <AdminCard titleKey="admin_store_insertions_coupons_title">
            <div className="mb-3">
              <button type="button" className={Sam.btn.secondary} onClick={() => void loadCoupons()}>
                {t("admin_store_insertions_refresh_coupons")}
              </button>
            </div>
            <AdminStoreCouponWriterPanel
              campaigns={coupons}
              loading={couponsLoading}
              error={couponsErr}
              onRefresh={loadCoupons}
              stateLabel={stateLabel}
            />
          </AdminCard>
        : null}
      </div>
    </AdminDeliveryCmsChrome>
  );
}
