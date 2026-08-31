"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { adminFetch } from "@/lib/admin/admin-fetch-client";
import type { DeliveryAdCommercialCatalogReadModel } from "@/lib/stores/advertising/delivery-ad-commercial-catalog";
import { parseDeliveryAdPhpMajorToMinor } from "@/lib/stores/advertising/delivery-ad-commercial-labels";

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
        {lang === "en" ? "Partner enabled" : "Partner 활성"}
      </label>
      <label className="flex items-center gap-2 text-[12px]">
        <input
          type="checkbox"
          checked={accepting}
          disabled={busy}
          onChange={(e) => setAccepting(e.target.checked)}
        />
        {lang === "en" ? "Accept new members" : "신규 가입 접수"}
      </label>
      <label className="text-[12px]">
        {lang === "en" ? "Monthly fee (PHP)" : "월 회비 (PHP)"}
        <input
          className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1 text-[13px]"
          placeholder={lang === "en" ? "Not set" : "미설정"}
          value={fee}
          disabled={busy}
          onChange={(e) => setFee(e.target.value)}
        />
      </label>
      <label className="text-[12px]">
        {lang === "en" ? "Ad discount %" : "광고 할인 %"}
        <input
          className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1 text-[13px]"
          value={discount}
          disabled={busy}
          onChange={(e) => setDiscount(e.target.value)}
        />
      </label>
      <button
        type="button"
        disabled={busy}
        className="inline-flex min-h-[40px] items-center justify-center rounded-ui-rect border border-[#0A823E] bg-[#0A823E] px-4 text-[13px] font-semibold text-white transition hover:bg-[#087a38] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A823E]/40 active:scale-[0.99] disabled:opacity-50 sm:col-span-2 sm:w-auto sm:justify-self-start"
        onClick={() => {
          const monthlyFeeMinor = fee.trim() === "" ? null : parseDeliveryAdPhpMajorToMinor(fee);
          if (fee.trim() !== "" && monthlyFeeMinor == null) return;
          onSave({
            enabled,
            acceptingNewMembers: accepting,
            monthlyFeeMinor,
            advertisingDiscountPercent: Number(discount),
          });
        }}
      >
        {lang === "en" ? "Save Partner config" : "Partner 설정 저장"}
      </button>
    </div>
  );
}

export function useAdminPartnerCatalogConfig() {
  const [catalog, setCatalog] = useState<DeliveryAdCommercialCatalogReadModel | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
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
        setError(j.error ?? "save_failed");
        return;
      }
      setCatalog(j.catalog);
    } finally {
      setBusy(false);
    }
  };

  return { catalog, busy, error, load, savePartner };
}
