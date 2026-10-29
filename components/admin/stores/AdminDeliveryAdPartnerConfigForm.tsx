"use client";

import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { adminFetch } from "@/lib/admin/admin-fetch-client";
import type { DeliveryAdCommercialCatalogReadModel } from "@/lib/stores/advertising/delivery-ad-commercial-catalog";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
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
      <AdminActionButton variant="primary" className="sm:col-span-2 sm:justify-self-start"
        disabled={busy}
        onClick={async () => {
          const ko = lang !== "en";
          setInputError(null);
          const monthlyFeeMinor = fee.trim() === "" ? null : parseDeliveryAdPhpMajorToMinor(fee);
          if (fee.trim() !== "" && monthlyFeeMinor == null) {
            setInputError(ko ? "월 회비를 숫자(PHP)로 입력하세요." : "Enter the monthly fee as a number (PHP).");
            return;
          }
          const discountNum = Number(discount);
          if (!Number.isFinite(discountNum) || discountNum < 0 || discountNum > 100) {
            setInputError(ko ? "광고 할인은 0~100 사이 숫자로 입력하세요." : "Enter an ad discount between 0 and 100.");
            return;
          }
          // v4 UI-11 — 요금·할인 변경은 확인 후 저장
          const confirmed = await confirmAdminAction({
            level: adminActionLevel("save"),
            ko,
            title: ko ? "Partner 설정을 저장할까요?" : "Save Partner settings?",
            description: ko
              ? `활성 ${enabled ? "켜짐" : "꺼짐"} · 신규 가입 ${accepting ? "접수" : "중지"} · 월 회비 ${fee.trim() || "미설정"} PHP · 광고 할인 ${discountNum}%`
              : `Enabled ${enabled ? "on" : "off"} · New members ${accepting ? "open" : "closed"} · Fee ${fee.trim() || "not set"} PHP · Discount ${discountNum}%`,
            confirmLabel: ko ? "Partner 설정 저장" : "Save Partner config",
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
        {busy ? (lang === "en" ? "Saving…" : "저장 중…") : lang === "en" ? "Save Partner config" : "Partner 설정 저장"}
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
