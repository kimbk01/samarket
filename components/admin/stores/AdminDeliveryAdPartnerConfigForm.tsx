"use client";

import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { adminFetch } from "@/lib/admin/admin-fetch-client";
import type { DeliveryAdCommercialCatalogReadModel } from "@/lib/stores/advertising/delivery-ad-commercial-catalog";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { parseDeliveryAdPhpMajorToMinor } from "@/lib/stores/advertising/delivery-ad-commercial-labels";
import { translateBy } from "@/lib/i18n/translate-by";

type Props = {
  config: DeliveryAdCommercialCatalogReadModel["partnerConfig"];
  busy: boolean;
  lang: "ko" | "en";
  onSave: (body: Record<string, unknown>) => void;
};

/** UI-2 — Partner config form (SSOT on partner admin page). */
export function AdminDeliveryAdPartnerConfigForm({ config, busy, lang, onSave }: Props) {
  const c = config;
  const [enabled, setEnabled] = useState(c?.enabled ?? false);
  const [accepting, setAccepting] = useState(c?.acceptingNewMembers ?? false);
  const [fee, setFee] = useState(
    c?.monthlyFeeMinor == null ? "" : (c.monthlyFeeMinor / 100).toFixed(2)
  );
  const [discount, setDiscount] = useState(String(c?.advertisingDiscountPercent ?? 0));
  const [inputError, setInputError] = useState<string | null>(null);

  useEffect(() => {
    setEnabled(c?.enabled ?? false);
    setAccepting(c?.acceptingNewMembers ?? false);
    setFee(c?.monthlyFeeMinor == null ? "" : (c.monthlyFeeMinor / 100).toFixed(2));
    setDiscount(String(c?.advertisingDiscountPercent ?? 0));
  }, [c]);

  return (
    <div className="grid gap-2 sm:grid-cols-2" data-admin-partner-config="design-board">
      <label className="flex items-center gap-2 text-[12px]">
        <input
          type="checkbox"
          checked={enabled}
          disabled={busy}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        {translateBy(lang, "admin_partner_enabled")}
      </label>
      <label className="flex items-center gap-2 text-[12px]">
        <input
          type="checkbox"
          checked={accepting}
          disabled={busy}
          onChange={(e) => setAccepting(e.target.checked)}
        />
        {translateBy(lang, "admin_accept_new_members")}
      </label>
      <label className="text-[12px]">
        {translateBy(lang, "admin_monthly_fee_php")}
        <input
          className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1 text-[13px]"
          placeholder={translateBy(lang, "admin_not_set")}
          value={fee}
          disabled={busy}
          onChange={(e) => setFee(e.target.value)}
        />
      </label>
      <label className="text-[12px]">
        {translateBy(lang, "admin_ad_discount")}
        <input
          className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1 text-[13px]"
          value={discount}
          disabled={busy}
          onChange={(e) => setDiscount(e.target.value)}
        />
      </label>
      <AdminActionButton variant="primary" className="sm:col-span-2 sm:justify-self-start"
        disabled={busy}
        onClick={async () => {
          const ko = lang !== "en";
          setInputError(null);
          const monthlyFeeMinor = fee.trim() === "" ? null : parseDeliveryAdPhpMajorToMinor(fee);
          if (fee.trim() !== "" && monthlyFeeMinor == null) {
            setInputError(translateBy(ko ? "ko" : "en", "admin_stores_enter_monthly_fee_as_number_php"));
            return;
          }
          const discountNum = Number(discount);
          if (!Number.isFinite(discountNum) || discountNum < 0 || discountNum > 100) {
            setInputError(translateBy(ko ? "ko" : "en", "admin_stores_enter_ad_discount_between_0_and"));
            return;
          }
          // v4 UI-11 — 요금·할인 변경은 확인 후 저장
          const confirmed = await confirmAdminAction({
            level: adminActionLevel("save"),
            ko,
            title: translateBy(ko ? "ko" : "en", "admin_stores_save_partner_settings"),
            description: translateBy(ko ? "ko" : "en", "admin_stores_partner_save_desc", {
              enabled: translateBy(ko ? "ko" : "en", enabled ? "admin_stores_partner_state_on" : "admin_stores_partner_state_off"),
              accepting: translateBy(ko ? "ko" : "en", accepting ? "admin_stores_partner_accepting_open" : "admin_stores_partner_accepting_closed"),
              fee: fee.trim() || translateBy(ko ? "ko" : "en", "admin_stores_partner_fee_not_set"),
              discount: discountNum,
            }),
            confirmLabel: translateBy(ko ? "ko" : "en", "admin_stores_save_partner_config"),
          });
          if (!confirmed.ok) return;
          onSave({
            enabled,
            acceptingNewMembers: accepting,
            monthlyFeeMinor,
            advertisingDiscountPercent: discountNum,
          });
        }}
      >
        {busy ? (translateBy(lang, "common_saving")) : translateBy(lang, "admin_save_partner_config")}
      </AdminActionButton>
      {inputError ? (
        <p className="text-[12px] text-sam-danger sm:col-span-2" role="alert" data-admin-partner-config-input-error="1">
          {inputError}
        </p>
      ) : null}
    </div>
  );
}

export function useAdminPartnerCatalogConfig() {
  const [catalog, setCatalog] = useState<DeliveryAdCommercialCatalogReadModel | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await adminFetch("/api/admin/delivery-ads/commercial", {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        catalog?: DeliveryAdCommercialCatalogReadModel;
        error?: string;
      };
      if (!res.ok || !j.ok || !j.catalog) {
        setError(j.error ?? "load_failed");
        setCatalog(null);
        return;
      }
      setCatalog(j.catalog);
    } catch {
      setError("network_error");
      setCatalog(null);
    } finally {
      setLoading(false);
    }
  };

  const savePartner = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await adminFetch("/api/admin/delivery-ads/commercial", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: "update_partner",
          reason: "admin_partner_settings",
          ...body,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        catalog?: DeliveryAdCommercialCatalogReadModel;
        error?: string;
      };
      if (!res.ok || !j.ok || !j.catalog) {
        setError(j.error ?? "update_failed");
        return;
      }
      setCatalog(j.catalog);
    } catch {
      setError("network_error");
    } finally {
      setBusy(false);
    }
  };

  return { catalog, busy, loading, error, load, savePartner };
}
