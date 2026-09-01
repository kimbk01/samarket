"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  buildAdminGiftOpsHref,
  type AdminGiftOpsMoneySubtab,
} from "@/lib/gift-certificate/admin-gift-ops-tabs";
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
      <div className="rounded-ui-rect border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
        <p className="font-semibold">
          {safeT("gift_ops_legacy_money_archive_title", {
            fallbackKo: "Gift 정산 과거 기록 보관함",
            fallbackEn: "Historical Gift settlement archive",
          })}
        </p>
        <p className="mt-1">
          {safeT("gift_ops_legacy_money_archive_desc", {
            fallbackKo: "비제품 과거 기록만 제공합니다. 신규 현금화는 Admin 재무의 Coin 출금을 사용하세요.",
            fallbackEn: "Non-product historical records only. Use Coin withdrawal in Admin Finance for new payouts.",
          })}
        </p>
        <Link href="/admin/finance#coin-withdrawals" className="mt-2 inline-block font-semibold underline">
          {safeT("gift_ops_go_coin_withdrawal", {
            fallbackKo: "Coin 출금으로 이동",
            fallbackEn: "Go to Coin withdrawal",
          })}
        </Link>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link
          href={buildAdminGiftOpsHref({ tab: "finance", money: "external" })}
          className={[
            "rounded-ui-rect px-3 py-2 text-sm font-semibold",
            isExternal ? "bg-sam-fg text-sam-app" : "border border-sam-border bg-sam-surface",
          ].join(" ")}
          data-money-sub="external"
        >
          {safeT("gift_ops_money_external", { fallbackKo: "외부 환전", fallbackEn: "External cash-out" })}
        </Link>
        <Link
          href={buildAdminGiftOpsHref({ tab: "finance", money: "store-cash" })}
          className={[
            "rounded-ui-rect px-3 py-2 text-sm font-semibold",
            !isExternal ? "bg-sam-fg text-sam-app" : "border border-sam-border bg-sam-surface",
          ].join(" ")}
          data-money-sub="store-cash"
        >
          {safeT("gift_ops_money_store_cash", {
            fallbackKo: "과거 전환 기록",
            fallbackEn: "Historical conversion records",
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

  return (
    <div className="space-y-4" data-admin-gift-cash-outs-ops="1">
      <div className="flex flex-wrap gap-2">
        {CASH_STATUSES.map((s) => (
          <Link
            key={s || "all"}
            href={buildAdminGiftOpsHref({
              tab: "finance",
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
                        tab: "finance",
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
              routerPush(buildAdminGiftOpsHref({ tab: "finance", money: "external", extra: { status: status || null } }))
            }
          >
            ← {safeT("gift_ops_close_detail", { fallbackKo: "목록으로", fallbackEn: "Back to list" })}
          </button>
          <p className="text-lg font-semibold tabular-nums">{formatMoneyPhp(detail.amount)}</p>
          <p className="text-sm">
            {detail.storeName} · {detail.ownerLabel || "—"}
          </p>
          <p className="text-sm">{detail.status}</p>
          <p className="text-sm">
            {detail.destinationType}
            {detail.bankName ? ` · ${detail.bankName}` : ""} · {detail.accountNumber} · {detail.accountName}
          </p>
          <p className="rounded-ui-rect bg-sam-surface-muted p-3 text-sm text-sam-muted">
            {safeT("gift_ops_legacy_read_only", {
              fallbackKo: "읽기 전용 과거 기록입니다.",
              fallbackEn: "Read-only historical record.",
            })}
          </p>
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

  return (
    <div className="space-y-4" data-admin-gift-conversions-ops="1">
      {state === "loading" ? <p className="text-sm text-sam-muted">…</p> : null}
      {state === "error" ? (
        <div className="space-y-2">
          <p className="text-sm text-red-600">
            {safeT("gift_ops_conv_error", {
              fallbackKo: "과거 전환 요청을 불러오지 못했습니다.",
              fallbackEn: "Couldn’t load historical conversions.",
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
            fallbackKo: "현재 과거 전환 요청이 없습니다.",
            fallbackEn: "No historical conversion requests.",
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
                        tab: "finance",
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
            onClick={() => routerPush(buildAdminGiftOpsHref({ tab: "finance", money: "store-cash" }))}
          >
            ← {safeT("gift_ops_close_detail", { fallbackKo: "목록으로", fallbackEn: "Back to list" })}
          </button>
          <p className="text-lg font-semibold tabular-nums">{formatMoneyPhp(detail.amount)}</p>
          <p className="text-sm">
            {detail.storeName} · {detail.ownerLabel || "—"}
          </p>
          <p className="text-sm">{detail.status}</p>
          <p className="text-xs text-sam-muted">
            Available {formatMoneyPhp(detail.availableRevenue)} · Historical converted amount{" "}
            {formatMoneyPhp(detail.storeCashBalance)}
          </p>
          <p className="rounded-ui-rect bg-sam-surface-muted p-3 text-sm text-sam-muted">
            {safeT("gift_ops_legacy_read_only", {
              fallbackKo: "읽기 전용 과거 기록입니다.",
              fallbackEn: "Read-only historical record.",
            })}
          </p>
        </section>
      ) : null}
    </div>
  );
}
