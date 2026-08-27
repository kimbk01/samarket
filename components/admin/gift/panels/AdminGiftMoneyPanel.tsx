"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  buildAdminGiftOpsHref,
  type AdminGiftOpsMoneySubtab,
} from "@/lib/gift-certificate/admin-gift-ops-tabs";
import { canApproveGiftConversion } from "@/lib/gift-certificate/admin-gift-money-ops";
import { formatMoneyPhp } from "@/lib/utils/format";
import { Sam } from "@/lib/ui/css-vars";

type CashOutRow = {
  id: string;
  storeId: string;
  storeName: string;
  ownerUserId: string;
  ownerLabel?: string;
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
};

type ConversionRow = {
  id: string;
  storeId: string;
  storeName: string;
  ownerUserId: string;
  ownerLabel?: string;
  amount: number;
  status: string;
  createdAt: string;
  approvedAt: string | null;
  availableRevenue: number;
  storeCashBalance: number;
  openRecoveryAmount?: number;
};

const CASH_STATUSES = ["", "REQUESTED", "APPROVED", "PAID", "REJECTED", "CANCELLED"];

function dt(v: string | null | undefined): string {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleString();
  } catch {
    return v;
  }
}

export function AdminGiftMoneyPanel({
  moneySubtab,
  id,
  status,
}: {
  moneySubtab: AdminGiftOpsMoneySubtab;
  id: string;
  status: string;
}) {
  const { safeT } = useI18n();
  const router = useRouter();
  const isExternal = moneySubtab !== "store-cash";

  return (
    <div className="space-y-4" data-admin-gift-money="1">
      <div className="flex flex-wrap gap-2">
        <Link
          href={buildAdminGiftOpsHref({ tab: "money", money: "external" })}
          className={[
            "rounded-ui-rect px-3 py-2 text-sm font-semibold",
            isExternal ? "bg-sam-fg text-sam-app" : "border border-sam-border bg-sam-surface",
          ].join(" ")}
          data-money-sub="external"
        >
          {safeT("gift_ops_money_external", { fallbackKo: "외부 환전", fallbackEn: "External cash-out" })}
        </Link>
        <Link
          href={buildAdminGiftOpsHref({ tab: "money", money: "store-cash" })}
          className={[
            "rounded-ui-rect px-3 py-2 text-sm font-semibold",
            !isExternal ? "bg-sam-fg text-sam-app" : "border border-sam-border bg-sam-surface",
          ].join(" ")}
          data-money-sub="store-cash"
        >
          {safeT("gift_ops_money_store_cash", {
            fallbackKo: "Store Cash 전환",
            fallbackEn: "Store Cash conversion",
          })}
        </Link>
      </div>
      {isExternal ? (
        <ExternalCashOuts id={id} status={status} routerPush={(href) => router.push(href)} />
      ) : (
        <StoreCashConversions id={id} routerPush={(href) => router.push(href)} />
      )}
    </div>
  );
}

function ExternalCashOuts({
  id,
  status,
  routerPush,
}: {
  id: string;
  status: string;
  routerPush: (href: string) => void;
}) {
  const { safeT } = useI18n();
  const [rows, setRows] = useState<CashOutRow[]>([]);
  const [detail, setDetail] = useState<CashOutRow | null>(null);
  const [state, setState] = useState<"loading" | "error" | "empty" | "data">("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payoutMethod, setPayoutMethod] = useState("");
  const [payoutReference, setPayoutReference] = useState("");
  const [rejectReason, setRejectReason] = useState("");

  const loadList = useCallback(async () => {
    setState("loading");
    try {
      const res = await fetch("/api/admin/gift-certificates/cash-outs", {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json()) as { ok?: boolean; cashOuts?: CashOutRow[] };
      if (!res.ok || !json.ok) {
        setRows([]);
        setState("error");
        return;
      }
      let list = json.cashOuts ?? [];
      if (status.trim()) {
        list = list.filter((r) => r.status.toUpperCase() === status.trim().toUpperCase());
      }
      setRows(list);
      setState(list.length === 0 ? "empty" : "data");
    } catch {
      setState("error");
    }
  }, [status]);

  const loadDetail = useCallback(async (requestId: string) => {
    const res = await fetch(`/api/admin/gift-certificates/cash-outs/${encodeURIComponent(requestId)}`, {
      credentials: "include",
      cache: "no-store",
    });
    const json = (await res.json()) as { ok?: boolean; cashOut?: CashOutRow };
    setDetail(json.ok && json.cashOut ? json.cashOut : null);
  }, []);

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
        setError(
          safeT("gift_ops_cash_action_fail", {
            fallbackKo: "처리에 실패했습니다.",
            fallbackEn: "Action failed.",
          })
        );
        return;
      }
      await Promise.all([loadList(), loadDetail(id)]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4" data-admin-gift-cash-outs-ops="1">
      <div className="flex flex-wrap gap-2">
        {CASH_STATUSES.map((s) => (
          <Link
            key={s || "all"}
            href={buildAdminGiftOpsHref({
              tab: "money",
              money: "external",
              extra: { status: s || null },
            })}
            className={[
              "rounded-ui-rect px-3 py-1.5 text-xs font-semibold",
              (status || "") === s ? "bg-sam-fg text-sam-app" : "border border-sam-border",
            ].join(" ")}
          >
            {s || "ALL"}
          </Link>
        ))}
      </div>

      {state === "loading" ? <p className="text-sm text-sam-muted">…</p> : null}
      {state === "error" ? (
        <div className="space-y-2">
          <p className="text-sm text-red-600">
            {safeT("gift_ops_cash_error", {
              fallbackKo: "환전 요청을 불러오지 못했습니다.",
              fallbackEn: "Couldn’t load cash-out requests.",
            })}
          </p>
          <button type="button" className={Sam.btn.secondary} onClick={() => void loadList()}>
            {safeT("gift_ops_retry", { fallbackKo: "다시 시도", fallbackEn: "Retry" })}
          </button>
        </div>
      ) : null}
      {state === "empty" ? (
        <p className="text-sm text-sam-muted">
          {safeT("gift_ops_cash_empty", {
            fallbackKo: "현재 외부 환전 요청이 없습니다.",
            fallbackEn: "No external cash-out requests.",
          })}
        </p>
      ) : null}

      {state === "data" ? (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">{r.storeName || "—"}</p>
                  <p className="text-sm">{r.ownerLabel || "—"}</p>
                  <p className="text-sm tabular-nums font-semibold">{formatMoneyPhp(r.amount)}</p>
                  <p className="text-xs text-sam-muted">
                    {r.status} · {r.destinationType} · avail {formatMoneyPhp(r.availableRevenue)} ·{" "}
                    {dt(r.createdAt)}
                  </p>
                  <details className="mt-1 text-xs text-sam-muted">
                    <summary>
                      {safeT("gift_ops_technical", { fallbackKo: "기술 상세", fallbackEn: "Technical details" })}
                    </summary>
                    <p className="break-all font-mono">{r.id}</p>
                  </details>
                </div>
                <button
                  type="button"
                  className={`${Sam.btn.secondary} min-h-[40px] px-3`}
                  onClick={() =>
                    routerPush(
                      buildAdminGiftOpsHref({
                        tab: "money",
                        money: "external",
                        extra: { id: r.id, status: status || null },
                      })
                    )
                  }
                >
                  {safeT("gift_ops_cta_review", { fallbackKo: "검토", fallbackEn: "Review" })}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {id && detail ? (
        <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <button
            type="button"
            className="text-sm font-semibold text-signature underline"
            onClick={() =>
              routerPush(buildAdminGiftOpsHref({ tab: "money", money: "external", extra: { status: status || null } }))
            }
          >
            ← {safeT("gift_ops_close_detail", { fallbackKo: "목록으로", fallbackEn: "Back to list" })}
          </button>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <p className="text-lg font-semibold tabular-nums">{formatMoneyPhp(detail.amount)}</p>
          <p className="text-sm">
            {detail.storeName} · {detail.ownerLabel || "—"}
          </p>
          <p className="text-sm">{detail.status}</p>
          <p className="text-sm">
            {detail.destinationType}
            {detail.bankName ? ` · ${detail.bankName}` : ""} · {detail.accountNumber} · {detail.accountName}
          </p>
          {detail.status.toUpperCase() === "REQUESTED" ? (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                className={`${Sam.btn.primary} min-h-[44px]`}
                disabled={busy}
                onClick={() => void postAction("approve")}
              >
                {safeT("gift_admin_cash_out_approve", { fallbackKo: "승인", fallbackEn: "Approve" })}
              </button>
              <input
                className="rounded-ui-rect border border-sam-border px-3 py-2 text-sm"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Reject reason"
              />
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
          {detail.status.toUpperCase() === "APPROVED" ? (
            <div className="space-y-2">
              <input
                className="w-full rounded-ui-rect border border-sam-border px-3 py-2 text-sm"
                value={payoutMethod}
                onChange={(e) => setPayoutMethod(e.target.value)}
                placeholder="payout_method"
              />
              <input
                className="w-full rounded-ui-rect border border-sam-border px-3 py-2 text-sm"
                value={payoutReference}
                onChange={(e) => setPayoutReference(e.target.value)}
                placeholder="payout_reference"
              />
              <button
                type="button"
                className={`${Sam.btn.primary} min-h-[44px] w-full`}
                disabled={busy}
                onClick={() =>
                  void postAction("mark_paid", { payoutMethod, payoutReference })
                }
              >
                {safeT("gift_admin_cash_out_mark_paid", {
                  fallbackKo: "지급 완료 처리",
                  fallbackEn: "Mark paid",
                })}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function StoreCashConversions({
  id,
  routerPush,
}: {
  id: string;
  routerPush: (href: string) => void;
}) {
  const { safeT } = useI18n();
  const [rows, setRows] = useState<ConversionRow[]>([]);
  const [detail, setDetail] = useState<ConversionRow | null>(null);
  const [state, setState] = useState<"loading" | "error" | "empty" | "data">("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setState("loading");
    try {
      const res = await fetch("/api/admin/gift-certificates/conversions", {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json()) as { ok?: boolean; conversions?: ConversionRow[] };
      if (!res.ok || !json.ok) {
        setState("error");
        return;
      }
      const list = json.conversions ?? [];
      setRows(list);
      setState(list.length === 0 ? "empty" : "data");
    } catch {
      setState("error");
    }
  }, []);

  const loadDetail = useCallback(async (requestId: string) => {
    const res = await fetch(`/api/admin/gift-certificates/conversions/${encodeURIComponent(requestId)}`, {
      credentials: "include",
      cache: "no-store",
    });
    const json = (await res.json()) as { ok?: boolean; conversion?: ConversionRow };
    setDetail(json.ok && json.conversion ? json.conversion : null);
  }, []);

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
      const json = (await res.json()) as { ok?: boolean };
      if (!res.ok || !json.ok) {
        setError(
          safeT("gift_u6_err_generic", {
            fallbackKo: "전환 승인에 실패했습니다.",
            fallbackEn: "Couldn’t approve conversion.",
          })
        );
        return;
      }
      await Promise.all([loadList(), loadDetail(id)]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4" data-admin-gift-conversions-ops="1">
      {state === "loading" ? <p className="text-sm text-sam-muted">…</p> : null}
      {state === "error" ? (
        <div className="space-y-2">
          <p className="text-sm text-red-600">
            {safeT("gift_ops_conv_error", {
              fallbackKo: "Store Cash 전환 요청을 불러오지 못했습니다.",
              fallbackEn: "Couldn’t load Store Cash conversions.",
            })}
          </p>
          <button type="button" className={Sam.btn.secondary} onClick={() => void loadList()}>
            {safeT("gift_ops_retry", { fallbackKo: "다시 시도", fallbackEn: "Retry" })}
          </button>
        </div>
      ) : null}
      {state === "empty" ? (
        <p className="text-sm text-sam-muted">
          {safeT("gift_ops_conv_empty", {
            fallbackKo: "현재 Store Cash 전환 요청이 없습니다.",
            fallbackEn: "No Store Cash conversion requests.",
          })}
        </p>
      ) : null}

      {state === "data" ? (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{r.storeName || "—"}</p>
                  <p className="text-sm">{r.ownerLabel || "—"}</p>
                  <p className="text-sm tabular-nums font-semibold">{formatMoneyPhp(r.amount)}</p>
                  <p className="text-xs text-sam-muted">
                    {r.status} · avail {formatMoneyPhp(r.availableRevenue)} · cash{" "}
                    {formatMoneyPhp(r.storeCashBalance)} · {dt(r.createdAt)}
                  </p>
                  <details className="mt-1 text-xs text-sam-muted">
                    <summary>
                      {safeT("gift_ops_technical", { fallbackKo: "기술 상세", fallbackEn: "Technical details" })}
                    </summary>
                    <p className="break-all font-mono">{r.id}</p>
                  </details>
                </div>
                <button
                  type="button"
                  className={`${Sam.btn.secondary} min-h-[40px] px-3`}
                  onClick={() =>
                    routerPush(
                      buildAdminGiftOpsHref({
                        tab: "money",
                        money: "store-cash",
                        extra: { id: r.id },
                      })
                    )
                  }
                >
                  {safeT("gift_ops_cta_review", { fallbackKo: "검토", fallbackEn: "Review" })}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {id && detail ? (
        <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <button
            type="button"
            className="text-sm font-semibold text-signature underline"
            onClick={() => routerPush(buildAdminGiftOpsHref({ tab: "money", money: "store-cash" }))}
          >
            ← {safeT("gift_ops_close_detail", { fallbackKo: "목록으로", fallbackEn: "Back to list" })}
          </button>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <p className="text-lg font-semibold tabular-nums">{formatMoneyPhp(detail.amount)}</p>
          <p className="text-sm">
            {detail.storeName} · {detail.ownerLabel || "—"}
          </p>
          <p className="text-sm">{detail.status}</p>
          <p className="text-xs text-sam-muted">
            Available {formatMoneyPhp(detail.availableRevenue)} · Store Cash{" "}
            {formatMoneyPhp(detail.storeCashBalance)}
          </p>
          {canApproveGiftConversion({
            status: detail.status,
            openRecoveryAmount: detail.openRecoveryAmount ?? 0,
          }).ok ? (
            <button
              type="button"
              className={`${Sam.btn.primary} min-h-[44px] w-full`}
              disabled={busy}
              onClick={() => void approve()}
            >
              {safeT("gift_u6_conversion_approve", {
                fallbackKo: "전환 승인",
                fallbackEn: "Approve conversion",
              })}
            </button>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
