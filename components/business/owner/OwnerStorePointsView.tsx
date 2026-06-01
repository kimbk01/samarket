"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OwnerStorePointWarningCard } from "@/components/business/owner/OwnerStorePointWarningCard";
import { OwnerStoreAdminDashSection } from "@/components/business/owner/OwnerStoreAdminDashSection";
import { resolveOwnerApiErrorMessage } from "@/lib/business/owner-api-error-i18n";
import type { StorePointChargeRequest, StorePointLedgerEntry } from "@/lib/types/store-point";
import type { OwnerPointAccountInquirySnapshot } from "@/lib/stores/owner-point-deposit-context";
import {
  OWNER_POINT_ACCOUNT_SECTION_ID,
  OWNER_POINT_DEPOSIT_SECTION_ID,
} from "@/lib/stores/owner-point-deposit-section-id";
import type { MessageKey } from "@/lib/i18n/messages";
import { catalogDateLocale } from "@/lib/i18n/catalog-date-locale";

type Summary = {
  pointBalance: number;
  pointCommerceBlocked: boolean;
  estimatedAcceptCount: number;
  estimatedFeePerOrder: number;
};

type PendingCharge = {
  id: string;
  requestStatus: string;
  pointAmount: number;
  paymentAmount: number;
  requestedAt: string;
};

const LEDGER_TYPE_KEYS: Record<string, MessageKey> = {
  store_order_fee: "store_owner_point_entry_store_order_fee",
  store_charge: "store_owner_point_entry_store_charge",
  admin_adjust: "store_owner_point_entry_admin_adjust",
};

const CHARGE_STATUS_KEYS: Record<string, MessageKey> = {
  pending: "store_owner_point_charge_status_pending",
  waiting_confirm: "store_owner_point_charge_status_waiting",
  approved: "store_owner_point_charge_status_approved",
  rejected: "store_owner_point_charge_status_rejected",
  on_hold: "store_owner_point_charge_status_hold",
};

export function OwnerStorePointsView({ storeId }: { storeId: string }) {
  const { t, language } = useI18n();
  const locale = catalogDateLocale(language);

  const [summary, setSummary] = useState<Summary | null>(null);
  const [ledger, setLedger] = useState<StorePointLedgerEntry[]>([]);
  const [charges, setCharges] = useState<StorePointChargeRequest[]>([]);
  const [activeAccountInquiry, setActiveAccountInquiry] =
    useState<OwnerPointAccountInquirySnapshot | null>(null);
  const [latestAccountAnswer, setLatestAccountAnswer] =
    useState<OwnerPointAccountInquirySnapshot | null>(null);
  const [pendingCharge, setPendingCharge] = useState<PendingCharge | null>(null);
  const [canSubmitCharge, setCanSubmitCharge] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [chargeForm, setChargeForm] = useState({
    point_amount: "",
    depositor_name: "",
  });

  const formatPoints = (amount: number) =>
    `${Math.max(0, Math.floor(amount)).toLocaleString(locale)}P`;

  const load = useCallback(async () => {
    setLoading(true);
    setFormError(null);
    try {
      const pointsRes = await fetch(`/api/me/stores/${encodeURIComponent(storeId)}/points`, {
        credentials: "include",
      });
      const pointsJson = (await pointsRes.json()) as {
        ok?: boolean;
        error?: string;
        summary?: Summary;
        ledger?: StorePointLedgerEntry[];
        chargeRequests?: StorePointChargeRequest[];
        activeAccountInquiry?: OwnerPointAccountInquirySnapshot | null;
        latestAccountAnswer?: OwnerPointAccountInquirySnapshot | null;
        pendingCharge?: PendingCharge | null;
        canSubmitCharge?: boolean;
      };
      if (!pointsRes.ok || pointsJson.ok === false) {
        setFormError(resolveOwnerApiErrorMessage(pointsJson.error, t));
        return;
      }
      setSummary(pointsJson.summary ?? null);
      setLedger(pointsJson.ledger ?? []);
      setCharges(pointsJson.chargeRequests ?? []);
      setActiveAccountInquiry(pointsJson.activeAccountInquiry ?? null);
      setLatestAccountAnswer(pointsJson.latestAccountAnswer ?? null);
      setPendingCharge(pointsJson.pendingCharge ?? null);
      setCanSubmitCharge(Boolean(pointsJson.canSubmitCharge));
    } catch {
      setFormError(t("common_network_error"));
    } finally {
      setLoading(false);
    }
  }, [storeId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (loading) return;
    if (typeof window === "undefined") return;
    const hash = window.location.hash.replace(/^#/, "");
    if (hash !== OWNER_POINT_DEPOSIT_SECTION_ID && hash !== OWNER_POINT_ACCOUNT_SECTION_ID) return;
    document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [loading]);

  const submitAccountInquiry = async () => {
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch(`/api/me/stores/${encodeURIComponent(storeId)}/platform-inquiries`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inquiry_type: "store_point",
          inquiry_kind: "account_request",
        }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && j.ok) {
        void load();
      } else {
        setFormError(resolveOwnerApiErrorMessage(j.error, t));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const submitCharge = async () => {
    const pointAmount = Math.floor(Number(chargeForm.point_amount) || 0);
    if (pointAmount < 1) {
      setFormError(resolveOwnerApiErrorMessage("point_amount_required", t));
      return;
    }
    const depositorName = chargeForm.depositor_name.trim();
    if (!depositorName) {
      setFormError(resolveOwnerApiErrorMessage("depositor_name_required", t));
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch(`/api/me/stores/${encodeURIComponent(storeId)}/point-charges`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          point_amount: pointAmount,
          depositor_name: depositorName,
        }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && j.ok) {
        setChargeForm({ point_amount: "", depositor_name: "" });
        void load();
      } else {
        setFormError(resolveOwnerApiErrorMessage(j.error, t));
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !summary) {
    return <p className="text-sm text-sam-muted">{t("common_loading")}</p>;
  }

  const bal = summary?.pointBalance ?? 0;
  const blocked = summary?.pointCommerceBlocked ?? false;
  const accountAnswer =
    latestAccountAnswer?.answer?.trim() ||
    (activeAccountInquiry?.status === "answered" ? activeAccountInquiry.answer?.trim() : "");

  return (
    <div className="space-y-4 pb-8">
      <OwnerStorePointWarningCard
        storeId={storeId}
        pointBalance={bal}
        pointCommerceBlocked={blocked}
        pendingCharge={pendingCharge}
      />

      {formError ? (
        <p className="rounded-ui-rect bg-red-50 px-3 py-2 text-sm text-red-600">{formError}</p>
      ) : null}

      <OwnerStoreAdminDashSection
        title={t("store_owner_point_section_account")}
        id={OWNER_POINT_ACCOUNT_SECTION_ID}
      >
        <p className="text-sm text-sam-muted">{t("store_owner_point_account_inquiry_intro")}</p>

        {activeAccountInquiry?.status === "open" ? (
          <p className="mt-2 text-sm text-amber-800">{t("store_owner_point_account_inquiry_pending")}</p>
        ) : null}

        {accountAnswer ? (
          <div className="mt-3 space-y-2">
            <p className="text-sm font-semibold text-sam-fg">{t("store_owner_point_account_answer_title")}</p>
            <p className="text-xs text-sam-muted">{t("store_owner_point_account_answer_hint")}</p>
            <div className="rounded-ui-rect bg-sam-app p-3 text-sm whitespace-pre-wrap text-sam-fg">
              {accountAnswer}
            </div>
          </div>
        ) : null}

        {!activeAccountInquiry || activeAccountInquiry.status !== "open" ? (
          <button
            type="button"
            disabled={submitting}
            className="mt-3 w-full rounded-ui-rect border border-[#006241] bg-sam-surface py-2.5 text-sm font-semibold text-[#006241] disabled:opacity-50"
            onClick={() => void submitAccountInquiry()}
          >
            {t("store_owner_point_account_inquiry_submit")}
          </button>
        ) : null}
      </OwnerStoreAdminDashSection>

      <OwnerStoreAdminDashSection
        title={t("store_owner_point_section_charge")}
        id={OWNER_POINT_DEPOSIT_SECTION_ID}
      >
        <p className="text-sm text-sam-muted">
          {t("store_owner_point_balance_current")}:{" "}
          <span className="font-semibold tabular-nums text-[#006241]">{formatPoints(bal)}</span>
        </p>
        <p className="mt-1 text-xs text-sam-muted">{t("store_owner_point_charge_ratio_hint")}</p>

        {pendingCharge ? (
          <p className="mt-3 rounded-ui-rect bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {pendingCharge.requestStatus === "on_hold"
              ? t("store_owner_point_charge_on_hold")
              : `${t("store_owner_point_charge_pending")}: ${formatPoints(pendingCharge.pointAmount)}`}
          </p>
        ) : null}

        {canSubmitCharge ? (
          <div className="mt-4 space-y-3 border-t border-sam-border-soft pt-4">
            <label className="block text-sm">
              <span className="font-medium text-sam-fg">{t("store_owner_point_charge_amount")}</span>
              <input
                type="number"
                min={1}
                className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 tabular-nums"
                value={chargeForm.point_amount}
                onChange={(e) => setChargeForm((f) => ({ ...f, point_amount: e.target.value }))}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-sam-fg">{t("store_owner_point_charge_depositor")}</span>
              <input
                className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2"
                value={chargeForm.depositor_name}
                onChange={(e) => setChargeForm((f) => ({ ...f, depositor_name: e.target.value }))}
              />
            </label>
            <button
              type="button"
              disabled={submitting}
              className="w-full rounded-ui-rect bg-[#006241] py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              onClick={() => void submitCharge()}
            >
              {t("store_owner_point_charge_submit")}
            </button>
          </div>
        ) : null}
      </OwnerStoreAdminDashSection>

      <OwnerStoreAdminDashSection title={t("store_owner_point_ledger_title")}>
        {ledger.length === 0 ? (
          <p className="text-sm text-sam-muted">{t("store_owner_point_ledger_empty")}</p>
        ) : (
          <ul className="divide-y divide-sam-border-soft">
            {ledger.map((row) => (
              <li key={row.id} className="flex justify-between gap-2 py-2 text-sm">
                <span className="text-sam-fg">
                  {LEDGER_TYPE_KEYS[row.entryType]
                    ? t(LEDGER_TYPE_KEYS[row.entryType])
                    : row.description}
                  <span className="ml-2 text-xs text-sam-muted">
                    {new Date(row.createdAt).toLocaleString(locale)}
                  </span>
                </span>
                <span
                  className={`font-semibold tabular-nums ${row.amount < 0 ? "text-red-600" : "text-[#006241]"}`}
                >
                  {row.amount > 0 ? "+" : ""}
                  {row.amount.toLocaleString(locale)}P
                </span>
              </li>
            ))}
          </ul>
        )}
      </OwnerStoreAdminDashSection>

      <OwnerStoreAdminDashSection title={t("store_owner_point_charge_history_title")}>
        {charges.length === 0 ? (
          <p className="text-sm text-sam-muted">{t("store_owner_point_charge_history_empty")}</p>
        ) : (
          <ul className="divide-y divide-sam-border-soft">
            {charges.map((row) => (
              <li key={row.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
                <span className="text-sam-fg">
                  <span className="font-semibold tabular-nums">{row.pointAmount.toLocaleString(locale)}P</span>
                  {row.depositorName ? (
                    <span className="ml-2 text-xs text-sam-muted">{row.depositorName}</span>
                  ) : null}
                  <span className="ml-2 text-xs text-sam-muted">
                    {new Date(row.requestedAt).toLocaleString(locale)}
                  </span>
                </span>
                <span className="font-medium text-sam-muted">
                  {CHARGE_STATUS_KEYS[row.requestStatus]
                    ? t(CHARGE_STATUS_KEYS[row.requestStatus])
                    : t("common_content_unavailable")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </OwnerStoreAdminDashSection>
    </div>
  );
}
