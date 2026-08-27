"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { formatMoneyPhp } from "@/lib/utils/format";
import { Sam } from "@/lib/ui/css-vars";

type CashOutRow = {
  id: string;
  storeId: string;
  storeName: string;
  ownerUserId: string;
  amount: number;
  status: string;
  destinationType: string;
  accountNumber: string;
  accountName: string;
  bankName: string | null;
  createdAt: string;
  approvedAt: string | null;
  paidAt: string | null;
  availableRevenue: number;
  payoutMethod?: string | null;
  payoutReference?: string | null;
  payoutNote?: string | null;
  rejectionReason?: string | null;
};

export function AdminGiftCashOutsPage() {
  const { safeT } = useI18n();
  const router = useRouter();
  const sp = useSearchParams();
  const id = sp.get("id")?.trim() ?? "";
  const [rows, setRows] = useState<CashOutRow[]>([]);
  const [detail, setDetail] = useState<CashOutRow | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payoutMethod, setPayoutMethod] = useState("");
  const [payoutReference, setPayoutReference] = useState("");
  const [payoutNote, setPayoutNote] = useState("");
  const [rejectReason, setRejectReason] = useState("");

  const loadList = useCallback(async () => {
    setLoaded(false);
    const res = await fetch("/api/admin/gift-certificates/cash-outs", {
      credentials: "include",
      cache: "no-store",
    });
    const json = (await res.json()) as { ok?: boolean; cashOuts?: CashOutRow[] };
    setRows(json.ok ? json.cashOuts ?? [] : []);
    setLoaded(true);
  }, []);

  const loadDetail = useCallback(
    async (requestId: string) => {
      const res = await fetch(
        `/api/admin/gift-certificates/cash-outs/${encodeURIComponent(requestId)}`,
        { credentials: "include", cache: "no-store" }
      );
      const json = (await res.json()) as { ok?: boolean; cashOut?: CashOutRow; error?: string };
      if (json.ok && json.cashOut) {
        setDetail(json.cashOut);
        setError(null);
      } else {
        setDetail(null);
        setError(
          safeT("gift_admin_cash_out_load_fail", {
            fallbackKo: "환전 요청을 불러오지 못했습니다.",
            fallbackEn: "Couldn’t load the cash-out request.",
          })
        );
      }
    },
    [safeT]
  );

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (id) void loadDetail(id);
    else setDetail(null);
  }, [id, loadDetail]);

  const postAction = async (action: string, extra?: Record<string, string>) => {
    if (!id || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/gift-certificates/cash-outs/${encodeURIComponent(id)}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(String(json.error ?? "failed"));
        return;
      }
      await Promise.all([loadList(), loadDetail(id)]);
    } finally {
      setBusy(false);
    }
  };

  if (id && detail) {
    const st = detail.status.toUpperCase();
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-4" data-admin-gift-cash-outs-detail="1">
        <button
          type="button"
          className="text-sm font-semibold text-signature underline"
          onClick={() => router.push("/admin/gift-certificates/cash-outs")}
        >
          ←{" "}
          {safeT("gift_admin_cash_out_list", {
            fallbackKo: "상품권 환전 요청",
            fallbackEn: "Gift cash-out requests",
          })}
        </button>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 space-y-2">
          <p className="text-lg font-semibold tabular-nums">{formatMoneyPhp(detail.amount)}</p>
          <p className="text-sm">{detail.storeName || detail.storeId}</p>
          <p className="text-xs text-sam-muted">Owner: {detail.ownerUserId}</p>
          <p className="text-sm">Status: {detail.status}</p>
          <p className="text-sm">
            {detail.destinationType.toUpperCase()}
            {detail.bankName ? ` · ${detail.bankName}` : ""} · {detail.accountNumber} · {detail.accountName}
          </p>
          <p className="text-xs text-sam-muted">
            {safeT("gift_admin_cash_out_available", {
              fallbackKo: "현재 전환 가능 수익",
              fallbackEn: "Current available revenue",
            })}
            : {formatMoneyPhp(detail.availableRevenue)}
          </p>
          {detail.payoutMethod ? (
            <p className="text-xs">
              Paid: {detail.payoutMethod} / {detail.payoutReference}
            </p>
          ) : null}
        </div>
        {st === "REQUESTED" ? (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              className={`${Sam.btn.primary} min-h-[44px]`}
              disabled={busy}
              onClick={() => void postAction("approve")}
            >
              {safeT("gift_admin_cash_out_approve", { fallbackKo: "승인", fallbackEn: "Approve" })}
            </button>
            <label className="block text-sm">
              <span className="text-sam-muted">
                {safeT("gift_admin_cash_out_reject_reason", {
                  fallbackKo: "거절 사유",
                  fallbackEn: "Reject reason",
                })}
              </span>
              <input
                className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
            </label>
            <button
              type="button"
              className={`${Sam.btn.secondary} min-h-[44px]`}
              disabled={busy}
              onClick={() => void postAction("reject", { reason: rejectReason })}
            >
              {safeT("gift_admin_cash_out_reject", { fallbackKo: "거절", fallbackEn: "Reject" })}
            </button>
          </div>
        ) : null}
        {st === "APPROVED" ? (
          <div className="space-y-3">
            <p className="text-sm text-sam-muted">
              {safeT("gift_admin_cash_out_mark_paid_hint", {
                fallbackKo: "실제 외부 이체 후 method·reference를 입력하고 지급 완료로 표시하세요.",
                fallbackEn: "After the real external transfer, enter method + reference and mark paid.",
              })}
            </p>
            <label className="block text-sm">
              <span className="text-sam-muted">payout_method</span>
              <input
                className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2"
                value={payoutMethod}
                onChange={(e) => setPayoutMethod(e.target.value)}
                placeholder="gcash / bank_transfer"
              />
            </label>
            <label className="block text-sm">
              <span className="text-sam-muted">payout_reference</span>
              <input
                className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2"
                value={payoutReference}
                onChange={(e) => setPayoutReference(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="text-sam-muted">payout_note</span>
              <input
                className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2"
                value={payoutNote}
                onChange={(e) => setPayoutNote(e.target.value)}
              />
            </label>
            <button
              type="button"
              className={`${Sam.btn.primary} min-h-[44px] w-full`}
              disabled={busy}
              onClick={() =>
                void postAction("mark_paid", {
                  payoutMethod,
                  payoutReference,
                  payoutNote,
                })
              }
            >
              {safeT("gift_admin_cash_out_mark_paid", {
                fallbackKo: "지급 완료 (Mark Paid)",
                fallbackEn: "Mark Paid",
              })}
            </button>
            <button
              type="button"
              className={`${Sam.btn.secondary} min-h-[44px] w-full`}
              disabled={busy}
              onClick={() => void postAction("reject", { reason: rejectReason })}
            >
              {safeT("gift_admin_cash_out_reject", { fallbackKo: "거절", fallbackEn: "Reject" })}
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4" data-admin-gift-cash-outs="1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">
          {safeT("gift_admin_cash_out_title", {
            fallbackKo: "상품권 환전 요청",
            fallbackEn: "Gift cash-out requests",
          })}
        </h1>
        <Link href="/admin/gift-certificates/conversions" className="text-sm font-semibold text-signature underline">
          {safeT("gift_u6_nav_conversions", {
            fallbackKo: "Store Cash 전환 요청",
            fallbackEn: "Store Cash conversion requests",
          })}
        </Link>
      </div>
      {!loaded ? (
        <p className="text-sm text-sam-muted">…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-sam-muted">—</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="w-full rounded-ui-rect border border-sam-border bg-sam-surface p-3 text-left"
                onClick={() =>
                  router.push(`/admin/gift-certificates/cash-outs?id=${encodeURIComponent(r.id)}`)
                }
              >
                <p className="font-semibold tabular-nums">{formatMoneyPhp(r.amount)}</p>
                <p className="text-sm">{r.storeName || r.storeId}</p>
                <p className="text-xs text-sam-muted">
                  {r.status} · {r.destinationType} · {r.createdAt ? new Date(r.createdAt).toLocaleString() : ""}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
