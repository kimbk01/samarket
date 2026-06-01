"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OwnerStorePointWarningCard } from "@/components/business/owner/OwnerStorePointWarningCard";
import { OwnerStoreAdminDashSection } from "@/components/business/owner/OwnerStoreAdminDashSection";
import { resolveOwnerApiErrorMessage } from "@/lib/business/owner-api-error-i18n";
import type { StorePointChargeRequest, StorePointLedgerEntry } from "@/lib/types/store-point";
import type { OwnerPointDepositStep } from "@/lib/stores/owner-point-deposit-context";
import type { MessageKey } from "@/lib/i18n/messages";
import { catalogDateLocale } from "@/lib/i18n/catalog-date-locale";

type Summary = {
  pointBalance: number;
  pointCommerceBlocked: boolean;
  estimatedAcceptCount: number;
  estimatedFeePerOrder: number;
};

type AccountInquiry = {
  id: string;
  status: string;
  subject: string;
  answer: string | null;
  createdAt: string;
  answeredAt: string | null;
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

const STEP_TITLE_KEYS: Record<OwnerPointDepositStep, MessageKey> = {
  account_inquiry: "store_owner_point_step_account",
  awaiting_answer: "store_owner_point_step_awaiting",
  deposit: "store_owner_point_step_deposit",
  charge_pending: "store_owner_point_step_charge_pending",
};

export function OwnerStorePointsView({ storeId }: { storeId: string }) {
  const { t, language } = useI18n();
  const locale = catalogDateLocale(language);

  const [summary, setSummary] = useState<Summary | null>(null);
  const [ledger, setLedger] = useState<StorePointLedgerEntry[]>([]);
  const [charges, setCharges] = useState<StorePointChargeRequest[]>([]);
  const [depositStep, setDepositStep] = useState<OwnerPointDepositStep>("account_inquiry");
  const [latestAccountAnswer, setLatestAccountAnswer] = useState<AccountInquiry | null>(null);
  const [pendingCharge, setPendingCharge] = useState<PendingCharge | null>(null);
  const [canSubmitCharge, setCanSubmitCharge] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [chargeForm, setChargeForm] = useState({
    point_amount: "",
    payment_amount: "",
    depositor_name: "",
    bank_name: "",
    receipt_image_url: "",
    user_memo: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const pointsRes = await fetch(`/api/me/stores/${encodeURIComponent(storeId)}/points`, {
        credentials: "include",
      });
      const pointsJson = (await pointsRes.json()) as {
        summary?: Summary;
        ledger?: StorePointLedgerEntry[];
        chargeRequests?: StorePointChargeRequest[];
        depositStep?: OwnerPointDepositStep;
        latestAccountAnswer?: AccountInquiry | null;
        pendingCharge?: PendingCharge | null;
        canSubmitCharge?: boolean;
      };
      setSummary(pointsJson.summary ?? null);
      setLedger(pointsJson.ledger ?? []);
      setCharges(pointsJson.chargeRequests ?? []);
      setDepositStep(pointsJson.depositStep ?? "account_inquiry");
      setLatestAccountAnswer(pointsJson.latestAccountAnswer ?? null);
      setPendingCharge(pointsJson.pendingCharge ?? null);
      setCanSubmitCharge(Boolean(pointsJson.canSubmitCharge));
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    void load();
  }, [load]);

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
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch(`/api/me/stores/${encodeURIComponent(storeId)}/point-charges`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          point_amount: Number(chargeForm.point_amount),
          payment_amount: Number(chargeForm.payment_amount),
          depositor_name: chargeForm.depositor_name,
          bank_name: chargeForm.bank_name,
          receipt_image_url: chargeForm.receipt_image_url,
          user_memo: chargeForm.user_memo,
        }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && j.ok) {
        setChargeForm({
          point_amount: "",
          payment_amount: "",
          depositor_name: "",
          bank_name: "",
          receipt_image_url: "",
          user_memo: "",
        });
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

  return (
    <div className="space-y-4 pb-8">
      <OwnerStorePointWarningCard
        storeId={storeId}
        pointBalance={bal}
        pointCommerceBlocked={blocked}
        estimatedAcceptCount={summary?.estimatedAcceptCount}
        depositStep={depositStep}
        pendingCharge={pendingCharge}
      />

      <OwnerStoreAdminDashSection title={t(STEP_TITLE_KEYS[depositStep])}>
        {depositStep === "account_inquiry" ? (
          <div className="space-y-3">
            <p className="text-sm text-sam-muted">{t("store_owner_point_deposit_blocked_hint")}</p>
            <button
              type="button"
              disabled={submitting}
              className="w-full rounded-ui-rect bg-[#006241] py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              onClick={() => void submitAccountInquiry()}
            >
              {t("store_owner_point_account_inquiry_submit")}
            </button>
          </div>
        ) : null}

        {depositStep === "awaiting_answer" ? (
          <p className="text-sm text-sam-muted">{t("store_owner_point_account_inquiry_pending")}</p>
        ) : null}

        {(depositStep === "deposit" || depositStep === "charge_pending") && latestAccountAnswer?.answer ? (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-sam-fg">{t("store_owner_point_account_answer_title")}</p>
            <p className="text-xs text-sam-muted">{t("store_owner_point_account_answer_hint")}</p>
            <div className="rounded-ui-rect bg-sam-app p-3 text-sm whitespace-pre-wrap text-sam-fg">
              {latestAccountAnswer.answer}
            </div>
          </div>
        ) : null}

        {depositStep === "charge_pending" && pendingCharge ? (
          <p className="mt-3 rounded-ui-rect bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {t("store_owner_point_charge_pending")}: {pendingCharge.pointAmount.toLocaleString()}P
          </p>
        ) : null}

        {depositStep === "deposit" && canSubmitCharge ? (
          <div className="mt-4 space-y-3 border-t border-sam-border-soft pt-4">
            <h3 className="font-semibold text-sam-fg">{t("store_owner_point_charge_title")}</h3>
            {(
              [
                ["point_amount", "store_owner_point_charge_amount"],
                ["payment_amount", "store_owner_point_charge_payment"],
                ["depositor_name", "store_owner_point_charge_depositor"],
                ["bank_name", "store_owner_point_charge_bank"],
                ["receipt_image_url", "store_owner_point_charge_receipt"],
              ] as const
            ).map(([field, labelKey]) => (
              <label key={field} className="block text-sm">
                <span className="font-medium text-sam-fg">{t(labelKey)}</span>
                <input
                  className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2"
                  value={chargeForm[field]}
                  onChange={(e) => setChargeForm((f) => ({ ...f, [field]: e.target.value }))}
                />
              </label>
            ))}
            <label className="block text-sm">
              <span className="font-medium text-sam-fg">{t("store_owner_point_charge_memo")}</span>
              <textarea
                className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2"
                rows={3}
                value={chargeForm.user_memo}
                onChange={(e) => setChargeForm((f) => ({ ...f, user_memo: e.target.value }))}
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

        {formError ? <p className="mt-2 text-sm text-red-600">{formError}</p> : null}
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
                  {row.amount}P
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
                  {row.pointAmount.toLocaleString()}P · {row.paymentAmount.toLocaleString()} PHP
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
