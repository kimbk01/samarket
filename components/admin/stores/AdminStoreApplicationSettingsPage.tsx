"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminGlobalAlertSoundSection } from "@/components/admin/stores/AdminGlobalAlertSoundSection";
import { AdminStoreTaxonomyManager } from "@/components/admin/stores/AdminStoreTaxonomyManager";
import { invalidateStoreDeliveryAlertSoundCache } from "@/lib/business/store-order-alert-sound";
import { bustOrderMatchAlertSoundCache } from "@/lib/notifications/play-order-match-alert";

export function AdminStoreApplicationSettingsPage() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const menu = (searchParams.get("menu") ?? "").trim().toLowerCase();
  const activeMenu: "alerts" | "stores" = menu === "stores" ? "stores" : "alerts";
  /** 탭 전환 시 언마운트하지 않고 hidden — 업종 목록·선택·썸네일 유지 */
  const [storesPanelMounted, setStoresPanelMounted] = useState(activeMenu === "stores");

  const [msg, setMsg] = useState<string | null>(null);
  const msgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [riderLocationEnabled, setRiderLocationEnabled] = useState(false);
  const [riderLocationLoading, setRiderLocationLoading] = useState(false);
  const [deliverySettingsReady, setDeliverySettingsReady] = useState(false);
  const [riderLocationSaving, setRiderLocationSaving] = useState(false);
  const [riderLocationError, setRiderLocationError] = useState<string | null>(null);
  const [rideTimeSourceSaved, setRideTimeSourceSaved] = useState<"store" | "google">("store");
  const [rideTimeSourceDraft, setRideTimeSourceDraft] = useState<"store" | "google">("store");
  const [rideTimeSourceSaving, setRideTimeSourceSaving] = useState(false);
  const [rideTimeSourceError, setRideTimeSourceError] = useState<string | null>(null);

  const rideTimeSourceDirty = useMemo(
    () => rideTimeSourceDraft !== rideTimeSourceSaved,
    [rideTimeSourceDraft, rideTimeSourceSaved]
  );

  const showMessage = useCallback((text: string) => {
    if (msgTimerRef.current != null) clearTimeout(msgTimerRef.current);
    setMsg(text);
    msgTimerRef.current = setTimeout(() => {
      msgTimerRef.current = null;
      setMsg(null);
    }, 4000);
  }, []);

  useEffect(() => {
    if (activeMenu === "stores") setStoresPanelMounted(true);
  }, [activeMenu]);

  useEffect(() => {
    return () => {
      if (msgTimerRef.current != null) clearTimeout(msgTimerRef.current);
    };
  }, []);

  const loadRiderLocationSetting = useCallback(async () => {
    setRiderLocationLoading(true);
    setRiderLocationError(null);
    setRideTimeSourceError(null);
    try {
      const res = await fetch("/api/admin/delivery/settings", { credentials: "include" });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        rider_location_enabled?: unknown;
        ride_time_source?: unknown;
      };
      if (!res.ok || !j?.ok) {
        setRiderLocationError(typeof j?.error === "string" ? j.error : `HTTP ${res.status}`);
        return;
      }
      setRiderLocationEnabled(j.rider_location_enabled === true);
      const src = j.ride_time_source === "google" ? "google" : "store";
      setRideTimeSourceSaved(src);
      setRideTimeSourceDraft(src);
    } catch {
      setRiderLocationError("network_error");
    } finally {
      setRiderLocationLoading(false);
      setDeliverySettingsReady(true);
    }
  }, []);

  const saveRiderLocationSetting = useCallback(async (next: boolean) => {
    setRiderLocationSaving(true);
    setRiderLocationError(null);
    try {
      const res = await fetch("/api/admin/delivery/settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rider_location_enabled: next }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        rider_location_enabled?: unknown;
        ride_time_source?: unknown;
      };
      if (!res.ok || !j?.ok) {
        setRiderLocationError(typeof j?.error === "string" ? j.error : `HTTP ${res.status}`);
        return;
      }
      setRiderLocationEnabled(j.rider_location_enabled === true);
      if (j.ride_time_source === "google" || j.ride_time_source === "store") {
        setRideTimeSourceSaved(j.ride_time_source);
        setRideTimeSourceDraft(j.ride_time_source);
      }
      showMessage(t("admin_stores_saved"));
    } catch {
      setRiderLocationError("network_error");
    } finally {
      setRiderLocationSaving(false);
    }
  }, [showMessage, t]);

  const commitRideTimeSource = useCallback(async () => {
    const next = rideTimeSourceDraft;
    setRideTimeSourceSaving(true);
    setRideTimeSourceError(null);
    try {
      const res = await fetch("/api/admin/delivery/settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ride_time_source: next }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        ride_time_source?: unknown;
      };
      if (!res.ok || !j?.ok) {
        setRideTimeSourceError(typeof j?.error === "string" ? j.error : `HTTP ${res.status}`);
        return;
      }
      const src = j.ride_time_source === "google" ? "google" : "store";
      setRideTimeSourceSaved(src);
      setRideTimeSourceDraft(src);
      showMessage(t("admin_stores_app_ride_time_saved"));
    } catch {
      setRideTimeSourceError("network_error");
    } finally {
      setRideTimeSourceSaving(false);
    }
  }, [rideTimeSourceDraft, showMessage, t]);

  useEffect(() => {
    void loadRiderLocationSetting();
  }, [loadRiderLocationSetting]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <AdminPageHeader
        titleKey={
          activeMenu === "stores"
            ? "admin_page_store_settings_taxonomy"
            : "admin_page_store_settings_alerts"
        }
      />

      {msg ? (
        <p className="mt-4 rounded-ui-rect border border-green-200 bg-green-50 px-3 py-2 sam-text-body-secondary text-green-800">
          {msg}
        </p>
      ) : null}

      {activeMenu === "alerts" ? (
        <>
          <section className="mt-6 rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm">
            <h2 className="sam-text-body font-semibold text-sam-fg">{t("admin_stores_app_rider_tracking")}</h2>
            {riderLocationError ? (
              <p className="mt-2 sam-text-body-secondary text-red-700">({riderLocationError})</p>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={riderLocationLoading || riderLocationSaving}
                onClick={() => void saveRiderLocationSetting(!riderLocationEnabled)}
                className={`rounded-ui-rect border px-4 py-2 sam-text-body-secondary font-semibold disabled:opacity-50 ${
                  riderLocationEnabled
                    ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                    : "border-sam-border bg-sam-app text-sam-fg"
                }`}
              >
                {riderLocationLoading
                  ? t("common_loading")
                  : riderLocationSaving
                    ? t("admin_stores_saving")
                    : riderLocationEnabled
                      ? t("admin_stores_app_rider_on")
                      : t("admin_stores_app_rider_off")}
              </button>
              <button
                type="button"
                disabled={riderLocationLoading || riderLocationSaving}
                onClick={() => void loadRiderLocationSetting()}
                className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-helper text-sam-fg disabled:opacity-50"
              >
                {t("admin_stores_fee_refresh")}
              </button>
            </div>
          </section>

          <p className="sam-text-body-secondary text-sam-muted">
            {t("admin_stores_app_alert_ssot_hint")}{" "}
            <Link href="/admin/settings/notifications" className="text-sam-primary underline">
              {t("admin_settings_notifications_open")}
            </Link>
          </p>

          <AdminGlobalAlertSoundSection
            titleKey="admin_stores_app_alert_delivery_title"
            descriptionKey="admin_stores_app_alert_delivery_desc"
            codeKey="admin_settings.store_delivery_alert_sound"
            apiPath="/api/admin/store-delivery-alert-sound"
            onAfterMutation={invalidateStoreDeliveryAlertSoundCache}
          />

          <AdminGlobalAlertSoundSection
            titleKey="admin_stores_app_alert_match_title"
            descriptionKey="admin_stores_app_alert_match_desc"
            codeKey="admin_settings.order_match_chat_alert_sound"
            apiPath="/api/admin/order-match-chat-alert-sound"
            onAfterMutation={bustOrderMatchAlertSoundCache}
          />
        </>
      ) : null}

      {storesPanelMounted ? (
        <div className={activeMenu === "stores" ? undefined : "hidden"} aria-hidden={activeMenu !== "stores"}>
          <section className="mt-6 rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm">
            <h2 className="sam-text-body font-semibold text-sam-fg">{t("admin_stores_app_ride_time_title")}</h2>
            {rideTimeSourceError ? (
              <p className="mt-2 sam-text-body-secondary text-red-700">({rideTimeSourceError})</p>
            ) : null}
            <fieldset className="mt-3 space-y-2" disabled={!deliverySettingsReady || rideTimeSourceSaving}>
              <legend className="sr-only">{t("admin_stores_app_ride_time_legend")}</legend>
              <label className="flex cursor-pointer items-center gap-2 rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2">
                <input
                  type="radio"
                  name="ride_time_source"
                  checked={rideTimeSourceDraft === "store"}
                  onChange={() => setRideTimeSourceDraft("store")}
                />
                  <span className="font-semibold text-sam-fg">{t("admin_stores_app_ride_time_store")}</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2">
                <input
                  type="radio"
                  name="ride_time_source"
                  checked={rideTimeSourceDraft === "google"}
                  onChange={() => setRideTimeSourceDraft("google")}
                />
                  <span className="font-semibold text-sam-fg">{t("admin_stores_app_ride_time_google")}</span>
              </label>
            </fieldset>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={riderLocationLoading || rideTimeSourceSaving || !rideTimeSourceDirty}
                onClick={() => void commitRideTimeSource()}
                className="rounded-ui-rect bg-signature px-4 py-2 sam-text-body-secondary font-semibold text-white disabled:opacity-50"
              >
                {rideTimeSourceSaving ? t("admin_stores_saving") : t("common_save")}
              </button>
              <button
                type="button"
                disabled={riderLocationLoading || rideTimeSourceSaving || !rideTimeSourceDirty}
                onClick={() => setRideTimeSourceDraft(rideTimeSourceSaved)}
                className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary font-semibold text-sam-fg disabled:opacity-50"
              >
                {t("admin_stores_app_ride_time_cancel")}
              </button>
            </div>
          </section>

          <AdminStoreTaxonomyManager onMessage={showMessage} />
        </div>
      ) : null}
    </div>
  );
}
