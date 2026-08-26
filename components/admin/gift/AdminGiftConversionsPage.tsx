"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  adminConversionStatusLabelKey,
  canApproveGiftConversion,
} from "@/lib/gift-certificate/admin-gift-money-ops";
import type { MessageKey } from "@/lib/i18n/messages";
import { formatMoneyPhp } from "@/lib/utils/format";
import { Sam } from "@/lib/ui/css-vars";

type ConversionRow = {
  id: string;
  storeId: string;
  storeName: string;
  ownerUserId: string;
  amount: number;
  status: string;
  createdAt: string;
  approvedAt: string | null;
  availableRevenue: number;
  storeCashBalance: number;
  openRecoveryAmount: number;
  businessCredit?: number;
  recentLedger?: { entry_type?: string; amount?: number; created_at?: string }[];
};

export function AdminGiftConversionsPage() {
  const { safeT } = useI18n();
  const router = useRouter();
  const sp = useSearchParams();
  const id = sp.get("id")?.trim() ?? "";
  const [rows, setRows] = useState<ConversionRow[]>([]);
  const [detail, setDetail] = useState<ConversionRow | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [success, setSuccess] = useState(false);

  const [successCash, setSuccessCash] = useState<number | null>(null);

  const loadList = useCallback(async () => {
    setLoaded(false);
    const res = await fetch("/api/admin/gift-certificates/conversions", {
      credentials: "include",
      cache: "no-store",
    });
    const json = (await res.json()) as { ok?: boolean; conversions?: ConversionRow[] };
    setRows(json.ok ? json.conversions ?? [] : []);
    setLoaded(true);
  }, []);

  const loadDetail = useCallback(async (requestId: string) => {
    const res = await fetch(`/api/admin/gift-certificates/conversions/${encodeURIComponent(requestId)}`, {
      credentials: "include",
      cache: "no-store",
    });
    const json = (await res.json()) as { ok?: boolean; conversion?: ConversionRow; error?: string };
    if (json.ok && json.conversion) {
      setDetail(json.conversion);
      setError(null);
    } else {
      setDetail(null);
      setError(
        safeT("gift_u6_err_generic", {
          fallbackKo: "전환 요청을 불러오지 못했습니다.",
          fallbackEn: "Couldn’t load the conversion request.",
        })
      );
    }
  }, [safeT]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (id) void loadDetail(id);
    else setDetail(null);
  }, [id, loadDetail]);

  const approve = async () => {
    if (!id || busy || !detail) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/gift-certificates/conversions/${encodeURIComponent(id)}/approve`,
        { method: "POST", credentials: "include" }
      );
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        store_cash_balance?: number;
        data?: { store_cash_balance?: number };
      };
      if (!res.ok || !json.ok) {
        setError(
          safeT("gift_u6_err_generic", {
            fallbackKo: "전환 승인에 실패했습니다. 다시 시도해 주세요.",
            fallbackEn: "Couldn’t approve the conversion. Please try again.",
          })
        );
        return;
      }
      const cashAfter =
        typeof json.store_cash_balance === "number"
          ? Math.trunc(json.store_cash_balance)
          : typeof json.data?.store_cash_balance === "number"
            ? Math.trunc(json.data.store_cash_balance)
            : null;
      setConfirmOpen(false);
      if (cashAfter != null) setSuccessCash(cashAfter);
      setSuccess(true);
      void loadList();
      void loadDetail(id);
    } finally {
      setBusy(false);
    }
  };

  if (success && detail) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-4" data-admin-gift-convert-success="1">
        <h1 className="text-lg font-semibold">
          {safeT("gift_u6_success_title", {
            fallbackKo: "Cash 전환이 승인되었습니다.",
            fallbackEn: "Cash conversion approved.",
          })}
        </h1>
        <p className="text-sm tabular-nums" data-admin-gift-store-cash-after="1">
          {safeT("gift_u6_store_cash", { fallbackKo: "매장 Cash", fallbackEn: "Store Cash" })}:{" "}
          {formatMoneyPhp(successCash ?? detail.storeCashBalance)}
        </p>
        <Link
          href="/admin/gift-certificates/conversions"
          className={`${Sam.btn.primary} inline-flex min-h-[44px] items-center justify-center px-4`}
        >
          ←
        </Link>
      </div>
    );
  }

  if (id && !detail) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-4" data-admin-gift-convert-loading="1">
        {error ? <p className="text-sm text-red-600">{error}</p> : <p className="text-sm text-sam-muted">…</p>}
        <button
          type="button"
          className="text-sm font-semibold text-signature underline"
          onClick={() => router.push("/admin/gift-certificates/conversions")}
        >
          ←
        </button>
      </div>
    );
  }

  if (id && detail) {
    const gate = canApproveGiftConversion({
      status: detail.status,
      openRecoveryAmount: detail.openRecoveryAmount,
    });
    const sk = adminConversionStatusLabelKey(detail.status);
    const afterCash = detail.storeCashBalance + detail.amount;

    if (confirmOpen) {
      return (
        <div className="mx-auto max-w-2xl space-y-4 p-4" data-admin-gift-convert-confirm="1">
          <h1 className="text-lg font-semibold">
            {safeT("gift_u6_cta_approve", {
              fallbackKo: "Cash 전환 승인",
              fallbackEn: "Approve cash conversion",
            })}
          </h1>
          <p className="text-sm">
            {safeT("gift_u6_confirm", {
              fallbackKo: `상품권 수익 ${formatMoneyPhp(detail.amount)}을 매장 Cash로 전환 승인할까요?`,
              fallbackEn: `Approve converting gift revenue ${formatMoneyPhp(detail.amount)} to Store Cash?`,
            }).replace("{amount}", formatMoneyPhp(detail.amount))}
          </p>
          <p className="text-sm tabular-nums">
            {safeT("gift_u6_confirm_cash_before", {
              fallbackKo: "현재 Store Cash",
              fallbackEn: "Current Store Cash",
            })}
            : {formatMoneyPhp(detail.storeCashBalance)}
          </p>
          <p className="text-sm tabular-nums">
            {safeT("gift_u6_confirm_cash_after", { fallbackKo: "승인 후", fallbackEn: "After approval" })}
            : {formatMoneyPhp(afterCash)}
          </p>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="button"
            className={`${Sam.btn.primary} min-h-[48px] w-full`}
            disabled={busy}
            data-admin-gift-approve-submit="1"
            onClick={() => void approve()}
          >
            {busy
              ? "…"
              : safeT("gift_u6_approve_primary", {
                  fallbackKo: "전환 승인",
                  fallbackEn: "Approve conversion",
                })}
          </button>
          <button
            type="button"
            className="min-h-[44px] w-full rounded-ui-rect border border-sam-border text-sm font-semibold"
            disabled={busy}
            onClick={() => setConfirmOpen(false)}
          >
            ←
          </button>
        </div>
      );
    }

    return (
      <div className="mx-auto max-w-2xl space-y-4 p-4" data-admin-gift-convert-detail="1">
        <button
          type="button"
          className="text-sm font-semibold text-signature underline"
          onClick={() => router.push("/admin/gift-certificates/conversions")}
        >
          ←
        </button>
        <h1 className="text-lg font-semibold">
          {safeT("gift_u6_detail_title", {
            fallbackKo: "전환 요청 검토",
            fallbackEn: "Review conversion request",
          })}
        </h1>
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 text-sm space-y-2">
          <p className="font-mono text-xs break-all" data-conversion-id={detail.id}>
            {detail.id}
          </p>
          <p>
            {safeT("gift_u6_store", { fallbackKo: "매장", fallbackEn: "Store" })}: {detail.storeName || detail.storeId}
          </p>
          <p>
            {safeT("gift_u6_owner", { fallbackKo: "Owner", fallbackEn: "Owner" })}:{" "}
            <span className="font-mono text-xs break-all">{detail.ownerUserId}</span>
          </p>
          <p className="tabular-nums">
            {safeT("gift_u6_amount", { fallbackKo: "요청 금액", fallbackEn: "Requested amount" })}:{" "}
            <strong>{formatMoneyPhp(detail.amount)}</strong>
          </p>
          <p className="tabular-nums">
            {safeT("gift_u6_available", {
              fallbackKo: "현재 상품권 수익(Available)",
              fallbackEn: "Current gift revenue (Available)",
            })}
            : {formatMoneyPhp(detail.availableRevenue)}
          </p>
          <p className="tabular-nums">
            {safeT("gift_u6_store_cash", { fallbackKo: "매장 Cash", fallbackEn: "Store Cash" })}:{" "}
            {formatMoneyPhp(detail.storeCashBalance)}
          </p>
          <p className="tabular-nums">
            {safeT("gift_u6_recovery", {
              fallbackKo: "Recovery obligation",
              fallbackEn: "Recovery obligation",
            })}
            : {formatMoneyPhp(detail.openRecoveryAmount)}
          </p>
          <p>
            {safeT(sk as MessageKey, {
              fallbackKo: detail.status,
              fallbackEn: detail.status,
            })}
          </p>
          <p className="text-xs text-sam-muted">
            {detail.createdAt ? new Date(detail.createdAt).toLocaleString() : "—"}
          </p>
        </div>
        {(detail.recentLedger ?? []).length > 0 ? (
          <div className="rounded-ui-rect border border-sam-border p-3 text-xs space-y-1">
            <p className="font-semibold">
              {safeT("gift_u6_ledger_hint", {
                fallbackKo: "관련 Gift revenue ledger",
                fallbackEn: "Related gift revenue ledger",
              })}
            </p>
            {(detail.recentLedger ?? []).slice(0, 8).map((e, i) => (
              <p key={i} className="tabular-nums">
                {String(e.entry_type ?? "")} {formatMoneyPhp(Math.trunc(Number(e.amount) || 0))}
              </p>
            ))}
          </div>
        ) : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {!gate.ok ? (
          <p className="text-sm text-sam-muted" data-admin-gift-approve-blocked="1">
            {gate.reason === "recovery_blocked"
              ? safeT("gift_u6_blocked_recovery", {
                  fallbackKo: "Recovery obligation이 있어 승인할 수 없습니다.",
                  fallbackEn: "An open recovery obligation blocks approval.",
                })
              : safeT("gift_u6_blocked_status", {
                  fallbackKo: "이미 처리된 요청입니다.",
                  fallbackEn: "This request is already processed.",
                })}
          </p>
        ) : (
          <button
            type="button"
            className={`${Sam.btn.primary} min-h-[48px] w-full`}
            data-admin-gift-approve-cta="1"
            onClick={() => setConfirmOpen(true)}
          >
            {safeT("gift_u6_cta_approve", {
              fallbackKo: "Cash 전환 승인",
              fallbackEn: "Approve cash conversion",
            })}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4" data-admin-gift-conversions="1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">
          {safeT("gift_u6_conversions_title", {
            fallbackKo: "상품권 Cash 전환 요청",
            fallbackEn: "Gift cash conversion requests",
          })}
        </h1>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href="/admin/gift-certificates/revenue" className="font-semibold text-signature underline">
            {safeT("gift_u6_nav_revenue", {
              fallbackKo: "Platform Revenue",
              fallbackEn: "Platform Revenue",
            })}
          </Link>
          <Link href="/admin/gift-certificates/recovery" className="font-semibold text-signature underline">
            {safeT("gift_u6_nav_recovery", {
              fallbackKo: "Recovery Obligation",
              fallbackEn: "Recovery obligations",
            })}
          </Link>
        </div>
      </div>
      {!loaded ? (
        <p className="text-sm text-sam-muted">…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-sam-muted">
          {safeT("gift_u6_conversions_empty", {
            fallbackKo: "대기 중인 전환 요청이 없습니다.",
            fallbackEn: "No conversion requests.",
          })}
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const sk = adminConversionStatusLabelKey(r.status);
            return (
              <li
                key={r.id}
                className="rounded-ui-rect border border-sam-border bg-sam-surface p-3"
                data-conversion-id={r.id}
              >
                <p className="text-sm font-semibold truncate">{r.storeName || r.storeId}</p>
                <p className="mt-1 text-xs text-sam-muted font-mono break-all">{r.id}</p>
                <p className="mt-1 text-sm tabular-nums font-semibold">{formatMoneyPhp(r.amount)}</p>
                <p className="mt-1 text-xs">
                  {safeT(sk as MessageKey, { fallbackKo: r.status, fallbackEn: r.status })}
                </p>
                <p className="mt-1 text-xs text-sam-muted tabular-nums">
                  Cash {formatMoneyPhp(r.storeCashBalance)} · Avail {formatMoneyPhp(r.availableRevenue)} ·
                  Rec {formatMoneyPhp(r.openRecoveryAmount)}
                </p>
                <p className="mt-1 text-xs text-sam-muted">
                  {r.createdAt ? new Date(r.createdAt).toLocaleString() : "—"}
                </p>
                <button
                  type="button"
                  className={`${Sam.btn.primary} mt-3 min-h-[44px] w-full`}
                  onClick={() =>
                    router.push(`/admin/gift-certificates/conversions?id=${encodeURIComponent(r.id)}`)
                  }
                >
                  {safeT("gift_u6_cta_review", { fallbackKo: "검토", fallbackEn: "Review" })}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
