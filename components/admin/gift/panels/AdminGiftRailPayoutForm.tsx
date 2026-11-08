"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { formatAdminPhp } from "@/lib/admin/ui-standard/admin-format";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import {
  GIFT_RAIL_PAYOUT_METHODS,
  validateGiftRailPayoutForm,
  type GiftRailPayoutMethod,
  type GiftRailPayoutSummary,
} from "@/lib/gift-certificate/gift-rail-payout";
import { Sam } from "@/lib/ui/css-vars";
import { catalogPair } from "@/lib/i18n/catalog-pair";

type PayoutRow = {
  id: string;
  amountPhp: number;
  payoutMethod: string;
  payoutReference: string;
  payoutNote: string | null;
  createdAt: string;
};

const ERROR_COPY: Record<string, { ko: string; en: string }> = {
  invalid_args: catalogPair("admin_check_the_amount"),
  payout_exceeds_available: catalogPair("admin_amount_exceeds_the_available_gift_revenue"),
  payout_method_required: catalogPair("admin_choose_a_payout_method"),
  payout_reference_required: catalogPair("admin_enter_the_payout_reference"),
  payout_reference_duplicate: catalogPair("admin_this_payout_reference_was_already_used"),
  idempotency_key_conflict: catalogPair("admin_request_conflict_refresh"),
  not_admin: catalogPair("admin_platform_admins_only"),
  rpc_missing: catalogPair("admin_not_available_yet_db_not_applied"),
};

const METHOD_LABEL: Record<GiftRailPayoutMethod, { ko: string; en: string }> = {
  bank_transfer: catalogPair("admin_bank_transfer"),
  gcash: catalogPair("admin_points_payment_gcash"),
  maya: catalogPair("admin_stores_settlements_payout_method_maya"),
  other: catalogPair("admin_menu_bottom_icon_cat_misc"),
};

function newFormKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Admin gift rail payout (Owner D-2 option A) — pays a store's available gift certificate revenue.
 * Money authority is SQL `gift_certificate_admin_store_payout`; this form only collects input + confirm.
 */
export function AdminGiftRailPayoutForm({ storeId, onPaid }: { storeId: string; onPaid?: () => void }) {
  const { language } = useI18n();
  const ko = language !== "en";
  const t = (c: { ko: string; en: string }) => (ko ? c.ko : c.en);
  const [summary, setSummary] = useState<GiftRailPayoutSummary | null>(null);
  const [rows, setRows] = useState<PayoutRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<GiftRailPayoutMethod>("bank_transfer");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  /** Form-scoped idempotency key — stable across retries, regenerated only after success. */
  const [formKey, setFormKey] = useState(newFormKey);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch(`/api/admin/gift-certificates/payouts?storeId=${encodeURIComponent(storeId)}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; summary?: GiftRailPayoutSummary; payouts?: PayoutRow[] };
      if (!res.ok || !json.ok || !json.summary) {
        setLoadError(json.error ?? "load_failed");
        return;
      }
      setSummary(json.summary);
      setRows(json.payouts ?? []);
    } catch {
      setLoadError("load_failed");
    }
  }, [storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const amountPhp = Math.trunc(Number(amount) || 0);
  const check = summary
    ? validateGiftRailPayoutForm({
        amountPhp,
        availablePhp: summary.availablePhp,
        payoutMethod: method,
        payoutReference: reference,
      })
    : ({ ok: false, error: "invalid_args" } as const);

  const submit = async () => {
    if (!check.ok || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/gift-certificates/payouts", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          storeId,
          amountPhp,
          payoutMethod: method,
          payoutReference: reference.trim(),
          payoutNote: note.trim() || null,
          idempotencyKey: formKey,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; availableAfterPhp?: number };
      if (!res.ok || !json.ok) {
        const code = json.error ?? "payout_failed";
        setMessage({ tone: "error", text: ERROR_COPY[code] ? t(ERROR_COPY[code]) : code });
        return;
      }
      setMessage({
        tone: "ok",
        text: ko
          ? `지급 기록 완료 · 남은 지급 가능 ${formatAdminPhp(json.availableAfterPhp ?? 0)}`
          : `Payout recorded · available now ${formatAdminPhp(json.availableAfterPhp ?? 0)}`,
      });
      setAmount("");
      setReference("");
      setNote("");
      setConfirming(false);
      setFormKey(newFormKey());
      await load();
      onPaid?.();
    } catch {
      setMessage({ tone: "error", text: ko ? "네트워크 오류 — 같은 내용으로 다시 지급을 요청하세요." : "Network error — retry with the same values." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 border-t border-sam-border pt-3" data-admin-gift-rail-payout="1">
      <h4 className="text-sm font-semibold">{ko ? "상품권 정산 지급 (상품권 레일)" : "Gift rail payout"}</h4>
      <p className="text-xs text-sam-muted">
        {ko
          ? "상품권 사용 매출(수수료 차감 순액)은 Coin이 아니라 이 지급으로 정산합니다. 실제 이체 후 참조번호와 함께 기록하세요."
          : "Gift certificate revenue (net of the gift fee) is settled by this payout, not Coin. Record it after the actual transfer, with its reference."}
      </p>
      {loadError ? (
        <p className="text-xs text-sam-danger">{ERROR_COPY[loadError] ? t(ERROR_COPY[loadError]) : loadError}</p>
      ) : null}
      {summary ? (
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-ui-rect border border-sam-border p-2">
            <p className="text-xs text-sam-muted">{ko ? "지급 가능" : "Available"}</p>
            <p className="font-semibold tabular-nums">{formatAdminPhp(summary.availablePhp)}</p>
          </div>
          <div className="rounded-ui-rect border border-sam-border p-2">
            <p className="text-xs text-sam-muted">{ko ? "지급 완료" : "Paid out"}</p>
            <p className="font-semibold tabular-nums">
              {formatAdminPhp(summary.paidOutPhp)} · {summary.payoutCount}
              {ko ? "건" : ""}
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="space-y-1 text-xs">
          <span className="text-sam-muted">{ko ? "지급액 (PHP)" : "Amount (PHP)"}</span>
          <input
            className={`${Sam.input.base} w-full`}
            inputMode="numeric"
            value={amount}
            disabled={busy || confirming}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
          />
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-sam-muted">{ko ? "지급 수단" : "Method"}</span>
          <select
            className={`${Sam.input.select} w-full`}
            value={method}
            disabled={busy || confirming}
            onChange={(e) => setMethod(e.target.value as GiftRailPayoutMethod)}
          >
            {GIFT_RAIL_PAYOUT_METHODS.map((m) => (
              <option key={m} value={m}>
                {t(METHOD_LABEL[m])}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-sam-muted">{ko ? "참조번호 (필수)" : "Reference (required)"}</span>
          <input
            className={`${Sam.input.base} w-full`}
            value={reference}
            maxLength={120}
            disabled={busy || confirming}
            onChange={(e) => setReference(e.target.value)}
          />
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-sam-muted">{ko ? "메모" : "Note"}</span>
          <input
            className={`${Sam.input.base} w-full`}
            value={note}
            maxLength={1000}
            disabled={busy || confirming}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
      </div>
      {!check.ok && amount !== "" && ERROR_COPY[check.error] ? (
        <p className="text-xs text-sam-danger">{t(ERROR_COPY[check.error])}</p>
      ) : null}

      {confirming ? (
        <div className="space-y-2 rounded-ui-rect border border-sam-warning bg-sam-warning-soft p-3 text-sm">
          <p>
            {ko
              ? `${formatAdminPhp(amountPhp)}을 ${t(METHOD_LABEL[method])}(참조 ${reference.trim()})로 지급한 것으로 기록합니다. 되돌릴 수 없습니다.`
              : `Record a payout of ${formatAdminPhp(amountPhp)} via ${t(METHOD_LABEL[method])} (ref ${reference.trim()}). This cannot be undone.`}
          </p>
          <div className="flex gap-2">
            <AdminActionButton type="button" variant="primary" disabled={busy || !check.ok} onClick={() => void submit()}>
              {ko ? "지급 기록 확정" : "Confirm payout"}
            </AdminActionButton>
            <AdminActionButton type="button" variant="secondary" disabled={busy} onClick={() => setConfirming(false)}>
              {ko ? "취소" : "Cancel"}
            </AdminActionButton>
          </div>
        </div>
      ) : (
        <AdminActionButton type="button" variant="primary" disabled={!check.ok || busy} onClick={() => setConfirming(true)}>
          {ko ? "지급 기록" : "Record payout"}
        </AdminActionButton>
      )}
      {message ? (
        <p className={`text-xs ${message.tone === "ok" ? "text-sam-success" : "text-sam-danger"}`}>{message.text}</p>
      ) : null}

      {rows.length > 0 ? (
        <ul className="space-y-1 text-xs" data-admin-gift-rail-payout-history="1">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap justify-between gap-2 border-b border-sam-border/60 py-1 tabular-nums">
              <span>{formatAdminManilaDateTime(r.createdAt)}</span>
              <span>{formatAdminPhp(r.amountPhp)}</span>
              <span>
                {isKnownMethod(r.payoutMethod) ? t(METHOD_LABEL[r.payoutMethod]) : r.payoutMethod} · {r.payoutReference}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function isKnownMethod(v: string): v is GiftRailPayoutMethod {
  return (GIFT_RAIL_PAYOUT_METHODS as readonly string[]).includes(v);
}
