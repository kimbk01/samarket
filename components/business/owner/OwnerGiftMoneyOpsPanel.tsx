"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Banknote, ChevronRight, Clock, List, Wallet, type LucideIcon } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OwnerStoreAdminDashSection } from "@/components/business/owner/OwnerStoreAdminDashSection";
import {
  OWNER_ADMIN_LIST_CARD_CLASS,
  OWNER_ADMIN_OUTLINE_BTN_CLASS,
  OWNER_ADMIN_PRIMARY_BTN_CLASS,
} from "@/lib/business/owner-admin-list-ui";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import {
  aggregateOwnerRedemptionKpis,
  canRequestGiftCashConversion,
  conversionPendingAmount,
  ownerConversionRequestStatusLabelKey,
  ownerRedemptionStatusLabelKey,
  validateGiftConversionAmount,
  type OwnerGiftConversionRow,
  type OwnerGiftRedemptionRow,
} from "@/lib/gift-certificate/owner-gift-money-ops";
import {
  canRequestGiftCashOut,
  ownerCashOutStatusLabelKey,
  validateGiftCashOutAmount,
} from "@/lib/gift-certificate/gift-cash-out-ops";
import type { MessageKey } from "@/lib/i18n/messages";
import { formatMoneyPhp } from "@/lib/utils/format";
import { Sam } from "@/lib/ui/css-vars";

type MoneyView =
  | "money"
  | "history"
  | "redemptions"
  | "convert"
  | "convert-success"
  | "convert-history"
  | "cash-out"
  | "cash-out-success"
  | "cash-out-history";

type MoneyTabId = "summary" | "history" | "redemptions";

type RedemptionFilter = "all" | "pending" | "recognized" | "refund";

type RevenuePayload = {
  availableRevenue: number;
  storeCashBalance: number;
  openRecoveryAmount: number;
  outstandingBalance: number;
};

type CashOutRow = {
  id: string;
  amount: number;
  status: string;
  destinationType: string;
  accountNumber: string;
  accountName: string;
  bankName: string | null;
  createdAt: string;
};

function mapConversion(raw: Record<string, unknown>): OwnerGiftConversionRow {
  return {
    id: String(raw.id),
    amount: Math.trunc(Number(raw.amount) || 0),
    status: String(raw.status ?? ""),
    createdAt: String(raw.created_at ?? ""),
    approvedAt: raw.approved_at == null ? null : String(raw.approved_at),
  };
}

function mapHumanConversionError(
  code: string,
  safeT: (key: MessageKey, opts?: { fallbackKo: string; fallbackEn: string }) => string
): string {
  const c = code.toLowerCase();
  if (c.includes("insufficient") || c.includes("available")) {
    return safeT("gift_u5_err_insufficient", {
      fallbackKo: "전환 가능한 상품권 수익이 부족합니다.",
      fallbackEn: "Not enough available gift revenue.",
    });
  }
  if (c.includes("recovery")) {
    return safeT("gift_u5_err_recovery", {
      fallbackKo: "정산 조정 금액이 있어 Cash 전환을 신청할 수 없습니다.",
      fallbackEn: "A settlement adjustment blocks cash conversion.",
    });
  }
  return safeT("gift_u5_err_generic", {
    fallbackKo: "Cash 전환 신청에 실패했습니다. 다시 시도해 주세요.",
    fallbackEn: "Couldn’t submit the conversion request. Please try again.",
  });
}

function resolveActiveTab(view: MoneyView): MoneyTabId {
  if (view === "redemptions") return "redemptions";
  if (view === "history" || view === "convert-history" || view === "cash-out-history") return "history";
  return "summary";
}

function shouldShowMoneyTabs(view: MoneyView): boolean {
  return (
    view === "money" ||
    view === "history" ||
    view === "redemptions" ||
    view === "convert" ||
    view === "cash-out" ||
    view === "convert-history" ||
    view === "cash-out-history"
  );
}

function MoneyOpsTabs(props: {
  view: MoneyView;
  onGo: (view: MoneyView) => void;
  safeT: (key: MessageKey, opts?: { fallbackKo: string; fallbackEn: string }) => string;
}) {
  const active = resolveActiveTab(props.view);
  const tabs: { id: MoneyTabId; target: MoneyView; labelKo: string; labelEn: string; key: MessageKey }[] = [
    {
      id: "summary",
      target: "money",
      key: "gift_owner_tab_summary",
      labelKo: "수익 요약",
      labelEn: "Revenue summary",
    },
    {
      id: "history",
      target: "history",
      key: "gift_owner_tab_history",
      labelKo: "환전·전환 내역",
      labelEn: "Cash-out & conversion",
    },
    {
      id: "redemptions",
      target: "redemptions",
      key: "gift_owner_tab_redemptions",
      labelKo: "사용 내역",
      labelEn: "Usage history",
    },
  ];
  return (
    <div className="mb-3 grid min-w-0 grid-cols-3 gap-2" data-owner-gift-money-tabs="1">
      {tabs.map((tab) => {
        const selected = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            data-owner-gift-tab={tab.id}
            className={`flex min-h-[44px] min-w-0 items-center justify-center rounded-ui-rect px-1.5 text-center text-xs font-medium sm:text-sm ${
              selected ? "bg-signature text-white" : "border border-sam-border bg-sam-surface text-sam-fg"
            }`}
            onClick={() => props.onGo(tab.target)}
          >
            <span className="line-clamp-2">
              {props.safeT(tab.key, { fallbackKo: tab.labelKo, fallbackEn: tab.labelEn })}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ActionRow(props: {
  action: "cash-out" | "convert" | "pending" | "history";
  icon: LucideIcon;
  title: string;
  desc: string;
  disabled?: boolean;
  reason?: string | null;
  onClick: () => void;
}) {
  const Icon = props.icon;
  return (
    <div>
      <button
        type="button"
        data-owner-gift-action={props.action}
        disabled={props.disabled}
        className={`${OWNER_ADMIN_LIST_CARD_CLASS} flex w-full items-center gap-3 text-left disabled:cursor-not-allowed disabled:opacity-60`}
        onClick={props.onClick}
      >
        <Icon className="h-5 w-5 shrink-0 text-signature" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-sam-fg">{props.title}</p>
          <p className="mt-0.5 text-xs text-sam-muted">{props.desc}</p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-sam-muted" aria-hidden />
      </button>
      {props.disabled && props.reason ? (
        <p className="mt-1 px-1 text-xs text-sam-muted" data-owner-gift-action-blocked={props.action}>
          {props.reason}
        </p>
      ) : null}
    </div>
  );
}

export function OwnerGiftMoneyOpsPanel(props: {
  storeId: string;
  view: MoneyView;
  onGo: (view: MoneyView, extra?: Record<string, string>) => void;
  onBackHome: () => void;
}) {
  const { storeId, view, onGo, onBackHome } = props;
  const { safeT } = useI18n();
  const [loaded, setLoaded] = useState(false);
  const [revenue, setRevenue] = useState<RevenuePayload>({
    availableRevenue: 0,
    storeCashBalance: 0,
    openRecoveryAmount: 0,
    outstandingBalance: 0,
  });
  const [redemptions, setRedemptions] = useState<OwnerGiftRedemptionRow[]>([]);
  const [conversions, setConversions] = useState<OwnerGiftConversionRow[]>([]);
  const [cashOuts, setCashOuts] = useState<CashOutRow[]>([]);
  const [cashOutPending, setCashOutPending] = useState(0);
  const [amountStr, setAmountStr] = useState("");
  const [destType, setDestType] = useState<"gcash" | "bank">("gcash");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [bankName, setBankName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRequestId, setLastRequestId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [redemptionFilter, setRedemptionFilter] = useState<RedemptionFilter>("all");

  const load = useCallback(async () => {
    const sid = storeId.trim();
    if (!sid) return;
    setLoaded(false);
    const [rRes, redRes, cRes, cashOutRes] = await Promise.all([
      fetch(`/api/me/stores/${encodeURIComponent(sid)}/gift-certificates/revenue`, {
        credentials: "include",
        cache: "no-store",
      }),
      fetch(`/api/me/stores/${encodeURIComponent(sid)}/gift-certificates/redemptions`, {
        credentials: "include",
        cache: "no-store",
      }),
      fetch(`/api/me/stores/${encodeURIComponent(sid)}/gift-certificates/conversions`, {
        credentials: "include",
        cache: "no-store",
      }),
      fetch(`/api/me/stores/${encodeURIComponent(sid)}/gift-certificates/cash-outs`, {
        credentials: "include",
        cache: "no-store",
      }).catch(() => null),
    ]);
    const rJson = (await rRes.json()) as {
      ok?: boolean;
      availableRevenue?: number;
      storeCashBalance?: number;
      openRecoveryAmount?: number;
      outstandingBalance?: number;
    };
    const redJson = (await redRes.json()) as { ok?: boolean; redemptions?: OwnerGiftRedemptionRow[] };
    const cJson = (await cRes.json()) as { ok?: boolean; conversions?: Record<string, unknown>[] };
    const cashOutJson =
      cashOutRes && cashOutRes.ok
        ? ((await cashOutRes.json()) as {
            ok?: boolean;
            cashOuts?: {
              id?: string;
              status?: string;
              amount?: number;
              destinationType?: string;
              accountNumber?: string;
              accountName?: string;
              bankName?: string | null;
              createdAt?: string;
            }[];
            pendingAmount?: number;
          })
        : null;
    if (rJson.ok) {
      setRevenue({
        availableRevenue: Math.trunc(Number(rJson.availableRevenue) || 0),
        storeCashBalance: Math.trunc(Number(rJson.storeCashBalance) || 0),
        openRecoveryAmount: Math.trunc(Number(rJson.openRecoveryAmount) || 0),
        outstandingBalance: Math.trunc(Number(rJson.outstandingBalance) || 0),
      });
    }
    setRedemptions(redJson.ok ? redJson.redemptions ?? [] : []);
    setConversions(cJson.ok ? (cJson.conversions ?? []).map(mapConversion) : []);
    if (cashOutJson?.ok && Array.isArray(cashOutJson.cashOuts)) {
      const rows = cashOutJson.cashOuts.map((r) => ({
        id: String(r.id ?? ""),
        amount: Math.max(0, Math.trunc(Number(r.amount) || 0)),
        status: String(r.status ?? ""),
        destinationType: String(r.destinationType ?? ""),
        accountNumber: String(r.accountNumber ?? ""),
        accountName: String(r.accountName ?? ""),
        bankName: r.bankName == null ? null : String(r.bankName),
        createdAt: String(r.createdAt ?? ""),
      }));
      setCashOuts(rows);
      setCashOutPending(
        rows
          .filter((r) => r.status.toUpperCase() === "REQUESTED")
          .reduce((s, r) => s + r.amount, 0)
      );
    } else {
      setCashOuts([]);
      setCashOutPending(Math.trunc(Number(cashOutJson?.pendingAmount) || 0));
    }
    setLoaded(true);
  }, [storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const redeemKpis = useMemo(() => aggregateOwnerRedemptionKpis(redemptions), [redemptions]);
  const pendingConv = useMemo(() => conversionPendingAmount(conversions), [conversions]);
  const processingPending = cashOutPending + pendingConv;
  const gate = useMemo(
    () =>
      canRequestGiftCashConversion({
        availableRevenue: revenue.availableRevenue,
        openRecoveryAmount: revenue.openRecoveryAmount,
      }),
    [revenue.availableRevenue, revenue.openRecoveryAmount]
  );
  const canCashOutGate = useMemo(
    () =>
      canRequestGiftCashOut({
        availableRevenue: revenue.availableRevenue,
        openRecoveryAmount: revenue.openRecoveryAmount,
      }),
    [revenue.availableRevenue, revenue.openRecoveryAmount]
  );
  const canCashOut = canCashOutGate.ok;

  useEffect(() => {
    if (view === "convert" && gate.ok && !amountStr && revenue.availableRevenue > 0) {
      setAmountStr(String(revenue.availableRevenue));
    }
    if (view === "cash-out" && canCashOut && !amountStr && revenue.availableRevenue > 0) {
      setAmountStr(String(revenue.availableRevenue));
    }
  }, [view, gate.ok, canCashOut, amountStr, revenue.availableRevenue]);

  const submitCashOut = async () => {
    const sid = storeId.trim();
    if (!sid || busy) return;
    const validated = validateGiftCashOutAmount({
      amount: Number(amountStr),
      availableRevenue: revenue.availableRevenue,
    });
    if (!validated.ok) {
      setError(
        validated.error === "exceeds_available"
          ? safeT("gift_owner_cash_out_err_insufficient", {
              fallbackKo: "환전 가능한 상품권 수익이 부족합니다.",
              fallbackEn: "Not enough available gift revenue to cash out.",
            })
          : safeT("gift_owner_cash_out_err_amount", {
              fallbackKo: "환전 금액을 확인해 주세요.",
              fallbackEn: "Check the cash-out amount.",
            })
      );
      return;
    }
    if (!canCashOut) {
      setError(
        safeT("gift_owner_cash_out_blocked_none", {
          fallbackKo: "환전 가능한 확정 수익이 없습니다.",
          fallbackEn: "No available gift revenue to cash out.",
        })
      );
      return;
    }
    if (!accountNumber.trim() || !accountName.trim()) {
      setError(
        safeT("gift_owner_cash_out_err_dest", {
          fallbackKo: "지급 계좌 정보를 입력해 주세요.",
          fallbackEn: "Enter payout destination details.",
        })
      );
      return;
    }
    if (destType === "bank" && !bankName.trim()) {
      setError(
        safeT("gift_owner_cash_out_err_bank", {
          fallbackKo: "은행명을 입력해 주세요.",
          fallbackEn: "Enter the bank name.",
        })
      );
      return;
    }
    const confirmMsg = safeT("gift_owner_cash_out_confirm", {
      fallbackKo: `상품권 수익 ${formatMoneyPhp(validated.amount)} 환전을 신청할까요?`,
      fallbackEn: `Request cash-out of gift revenue ${formatMoneyPhp(validated.amount)}?`,
    });
    if (typeof window !== "undefined" && !window.confirm(confirmMsg)) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/me/stores/${encodeURIComponent(sid)}/gift-certificates/cash-outs`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: validated.amount,
          destinationType: destType,
          accountNumber: accountNumber.trim(),
          accountName: accountName.trim(),
          bankName: destType === "bank" ? bankName.trim() : null,
          idempotencyKey: `owner-gift-cashout-${sid}-${validated.amount}-${Date.now()}`,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        request_id?: string;
      };
      if (!res.ok || !json.ok) {
        setError(
          safeT("gift_owner_cash_out_err_generic", {
            fallbackKo: "환전 신청에 실패했습니다. 다시 시도해 주세요.",
            fallbackEn: "Couldn’t submit the cash-out request. Please try again.",
          })
        );
        return;
      }
      const rid = String(json.request_id ?? "").trim();
      setLastRequestId(rid || null);
      await load();
      onGo("cash-out-success", rid ? { requestId: rid } : undefined);
    } finally {
      setBusy(false);
    }
  };

  const cancelCashOut = async (requestId: string) => {
    const sid = storeId.trim();
    if (!sid || busy || !requestId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/me/stores/${encodeURIComponent(sid)}/gift-certificates/cash-outs`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", requestId }),
      });
      const json = (await res.json()) as { ok?: boolean };
      if (!res.ok || !json.ok) {
        setError(
          safeT("gift_owner_cash_out_cancel_fail", {
            fallbackKo: "환전 신청을 취소하지 못했습니다.",
            fallbackEn: "Couldn’t cancel the cash-out request.",
          })
        );
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  const submitConversion = async () => {
    const sid = storeId.trim();
    if (!sid || busy) return;
    const validated = validateGiftConversionAmount({
      amount: Number(amountStr),
      availableRevenue: revenue.availableRevenue,
    });
    if (!validated.ok) {
      setError(
        validated.error === "exceeds_available"
          ? safeT("gift_u5_err_insufficient", {
              fallbackKo: "전환 가능한 상품권 수익이 부족합니다.",
              fallbackEn: "Not enough available gift revenue.",
            })
          : safeT("gift_u5_err_generic", {
              fallbackKo: "Cash 전환 신청에 실패했습니다. 다시 시도해 주세요.",
              fallbackEn: "Couldn’t submit the conversion request. Please try again.",
            })
      );
      return;
    }
    if (!gate.ok) {
      setError(
        gate.reason === "recovery_blocked"
          ? safeT("gift_u5_err_recovery", {
              fallbackKo: "정산 조정 금액이 있어 Cash 전환을 신청할 수 없습니다.",
              fallbackEn: "A settlement adjustment blocks cash conversion.",
            })
          : safeT("gift_u5_convert_blocked_none", {
              fallbackKo: "전환 가능한 상품권 수익이 없습니다.",
              fallbackEn: "No gift revenue available to convert.",
            })
      );
      return;
    }
    const confirmMsg = safeT("gift_u5_convert_confirm", {
      fallbackKo: `상품권 수익 ${formatMoneyPhp(validated.amount)}을 매장 Cash로 전환 신청할까요?`,
      fallbackEn: `Request converting gift revenue ${formatMoneyPhp(validated.amount)} to Store Cash?`,
    }).replace("{amount}", formatMoneyPhp(validated.amount));
    if (typeof window !== "undefined" && !window.confirm(confirmMsg)) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/me/stores/${encodeURIComponent(sid)}/gift-certificates/conversions`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: validated.amount,
          idempotencyKey: `owner-gift-conv-${sid}-${validated.amount}-${Date.now()}`,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        request_id?: string;
        id?: string;
        conversion_request_id?: string;
      };
      if (!res.ok || !json.ok) {
        setError(mapHumanConversionError(String(json.error ?? ""), safeT));
        return;
      }
      const rid = String(json.request_id ?? json.conversion_request_id ?? json.id ?? "").trim();
      setLastRequestId(rid || null);
      await load();
      onGo("convert-success", rid ? { requestId: rid } : undefined);
    } finally {
      setBusy(false);
    }
  };

  const kpiCard = (label: string, value: string, testId: string, detail?: ReactNode) => (
    <div
      className="rounded-ui-rect border border-sam-border bg-sam-surface p-3"
      data-owner-gift-kpi={testId}
    >
      <p className="text-xs text-sam-muted">{label}</p>
      <p className="mt-1 text-base font-semibold tabular-nums break-words">{value}</p>
      {detail}
    </div>
  );

  const withTabs = (body: ReactNode) => (
    <>
      {shouldShowMoneyTabs(view) ? <MoneyOpsTabs view={view} onGo={(v) => onGo(v)} safeT={safeT} /> : null}
      {body}
    </>
  );

  const cashOutBlockedReason = !canCashOut
    ? safeT("gift_owner_cash_out_blocked_none", {
        fallbackKo: "환전 가능한 확정 수익이 없습니다.",
        fallbackEn: "No available gift revenue to cash out.",
      })
    : null;
  const convertBlockedReason = !gate.ok
    ? gate.reason === "recovery_blocked"
      ? safeT("gift_u5_convert_blocked_recovery", {
          fallbackKo: "정산 조정 금액이 있어 Store Cash 전환을 신청할 수 없습니다.",
          fallbackEn: "A settlement adjustment blocks Store Cash conversion.",
        })
      : safeT("gift_u5_convert_blocked_none", {
          fallbackKo: "전환 가능한 확정 상품권 수익이 없습니다.",
          fallbackEn: "No gift revenue available to convert.",
        })
    : null;

  const renderHistoryLists = () => (
    <div className="space-y-6" data-owner-gift-history="1">
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-sam-fg">
          {safeT("gift_owner_cash_out_history_title", {
            fallbackKo: "환전 내역",
            fallbackEn: "Cash-out history",
          })}
        </h3>
        {cashOuts.length === 0 ? (
          <p className="text-sm text-sam-muted">—</p>
        ) : (
          <ul className="space-y-2" data-owner-gift-cash-out-history="1">
            {cashOuts.map((c) => {
              const sk = ownerCashOutStatusLabelKey(c.status);
              return (
                <li key={c.id} className={OWNER_ADMIN_LIST_CARD_CLASS} data-cash-out-id={c.id}>
                  <p className="text-sm font-semibold tabular-nums">{formatMoneyPhp(c.amount)}</p>
                  <p className="mt-1 text-xs text-sam-muted">
                    {c.createdAt ? new Date(c.createdAt).toLocaleString() : "—"}
                  </p>
                  <p className="mt-1 text-xs">
                    {safeT(sk as MessageKey, {
                      fallbackKo: c.status,
                      fallbackEn: c.status,
                    })}
                  </p>
                  <p className="mt-1 text-xs text-sam-muted">
                    {c.destinationType.toUpperCase()}
                    {c.bankName ? ` · ${c.bankName}` : ""} · {c.accountName}
                  </p>
                  {c.status.toUpperCase() === "REQUESTED" ? (
                    <button
                      type="button"
                      className={`${OWNER_ADMIN_OUTLINE_BTN_CLASS} mt-2`}
                      disabled={busy}
                      onClick={() => void cancelCashOut(c.id)}
                    >
                      {safeT("gift_owner_cash_out_cancel", {
                        fallbackKo: "신청 취소",
                        fallbackEn: "Cancel request",
                      })}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold text-sam-fg">
          {safeT("gift_u5_conv_history_title", {
            fallbackKo: "Cash 전환 내역",
            fallbackEn: "Cash conversion history",
          })}
        </h3>
        {conversions.length === 0 ? (
          <p className="text-sm text-sam-muted">—</p>
        ) : (
          <ul className="space-y-2" data-owner-gift-conversion-history="1">
            {conversions.map((c) => {
              const sk = ownerConversionRequestStatusLabelKey(c.status);
              return (
                <li key={c.id} className={OWNER_ADMIN_LIST_CARD_CLASS} data-conversion-id={c.id}>
                  <p className="text-sm font-semibold tabular-nums">{formatMoneyPhp(c.amount)}</p>
                  <p className="mt-1 text-xs text-sam-muted">
                    {c.createdAt ? new Date(c.createdAt).toLocaleString() : "—"}
                  </p>
                  <p className="mt-1 text-xs">
                    {safeT(sk as MessageKey, {
                      fallbackKo: c.status,
                      fallbackEn: c.status,
                    })}
                  </p>
                  {c.approvedAt ? (
                    <p className="mt-1 text-xs text-sam-muted">{new Date(c.approvedAt).toLocaleString()}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );

  const filteredRedemptions = useMemo(() => {
    if (redemptionFilter === "all") return redemptions;
    return redemptions.filter((row) => {
      if (redemptionFilter === "refund") return row.reversed;
      if (redemptionFilter === "recognized") return !row.reversed && row.recognized;
      return !row.reversed && !row.recognized;
    });
  }, [redemptions, redemptionFilter]);

  if (view === "redemptions") {
    const filters: { id: RedemptionFilter; key: MessageKey; ko: string; en: string }[] = [
      { id: "all", key: "gift_owner_redemption_filter_all", ko: "전체", en: "All" },
      { id: "pending", key: "gift_owner_redemption_filter_pending", ko: "확정 대기", en: "Pending" },
      { id: "recognized", key: "gift_owner_redemption_filter_recognized", ko: "확정", en: "Recognized" },
      { id: "refund", key: "gift_owner_redemption_filter_refund", ko: "환불", en: "Refund" },
    ];
    return (
      <OwnerStoreAdminDashSection
        title={safeT("gift_u5_redemptions_title", {
          fallbackKo: "상품권 사용 내역",
          fallbackEn: "Gift redemptions",
        })}
      >
        {withTabs(
          <>
            <div className="mb-3 grid grid-cols-4 gap-1.5" data-owner-gift-redemption-filters="1">
              {filters.map((f) => {
                const selected = redemptionFilter === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    data-owner-gift-redemption-filter={f.id}
                    className={`min-h-[40px] rounded-ui-rect px-1 text-xs font-medium ${
                      selected
                        ? "bg-signature text-white"
                        : "border border-sam-border bg-sam-surface text-sam-fg"
                    }`}
                    onClick={() => setRedemptionFilter(f.id)}
                  >
                    {safeT(f.key, { fallbackKo: f.ko, fallbackEn: f.en })}
                  </button>
                );
              })}
            </div>
            {!loaded ? (
              <p className="text-sm text-sam-muted">…</p>
            ) : redemptions.length === 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-sam-muted">
                  {safeT("gift_u5_redemptions_empty", {
                    fallbackKo: "아직 사용된 상품권이 없습니다.",
                    fallbackEn: "No gift redemptions yet.",
                  })}
                </p>
                <button type="button" className={OWNER_ADMIN_PRIMARY_BTN_CLASS} onClick={onBackHome}>
                  {safeT("gift_owner_cta_apply", {
                    fallbackKo: "상품권 판매 신청",
                    fallbackEn: "Apply to sell gift certificates",
                  })}
                </button>
              </div>
            ) : filteredRedemptions.length === 0 ? (
              <p className="text-sm text-sam-muted">—</p>
            ) : (
              <ul className="space-y-2" data-owner-gift-redemption-list="1">
                {filteredRedemptions.map((row) => {
                  const open = expandedId === row.id;
                  const statusKey = ownerRedemptionStatusLabelKey(row);
                  const pending = !row.reversed && !row.recognized;
                  const feeLabelKey = pending ? "gift_u7_fee_pending" : "gift_u5_fee";
                  const netLabelKey = pending ? "gift_u7_net_pending" : "gift_u5_net";
                  return (
                    <li
                      key={row.id}
                      className={OWNER_ADMIN_LIST_CARD_CLASS}
                      data-redemption-id={row.id}
                      data-order-id={row.orderId}
                    >
                      <button
                        type="button"
                        className="w-full text-left"
                        onClick={() => setExpandedId(open ? null : row.id)}
                      >
                        <p className="truncate text-sm font-semibold">{row.giftTitle || "Gift"}</p>
                        <p className="text-xs text-sam-muted">
                          {row.giftScope === "PLATFORM"
                            ? safeT("gift_ops_type_platform", {
                                fallbackKo: "DIBAY 상품권",
                                fallbackEn: "DIBAY Gift",
                              })
                            : safeT("gift_ops_type_store", {
                                fallbackKo: "매장 상품권",
                                fallbackEn: "Store Gift",
                              })}
                        </p>
                        <p className="mt-1 text-xs text-sam-muted" data-owner-gift-customer="1">
                          {safeT("gift_owner_redemption_customer", {
                            fallbackKo: "고객",
                            fallbackEn: "Customer",
                          })}
                          : {row.customerLabel || "—"}
                        </p>
                        {row.publicGiftNumber ? (
                          <p
                            className="mt-1 text-xs text-sam-muted tabular-nums"
                            data-owner-gift-public-number={row.publicGiftNumber}
                          >
                            {safeT("gift_u2_public_number_label", {
                              fallbackKo: "상품권 번호",
                              fallbackEn: "Gift number",
                            })}
                            : {row.publicGiftNumber}
                          </p>
                        ) : null}
                        <p className="mt-1 text-xs text-sam-muted tabular-nums">
                          {row.createdAt ? new Date(row.createdAt).toLocaleString() : "—"}
                        </p>
                        <p className="mt-1 text-xs text-sam-muted">
                          {safeT("gift_owner_redemption_order_status", {
                            fallbackKo: "주문 상태",
                            fallbackEn: "Order status",
                          })}
                          : {row.orderStatus || "—"} · {row.orderNo || row.orderId.slice(0, 8)}
                        </p>
                        <div className="mt-2 grid grid-cols-1 gap-1 text-xs sm:grid-cols-3">
                          <span>
                            {safeT("gift_u5_used", { fallbackKo: "사용 금액", fallbackEn: "Redeemed" })}:{" "}
                            <strong className="tabular-nums">{formatMoneyPhp(row.redeemedAmount)}</strong>
                          </span>
                          <span>
                            {safeT(feeLabelKey as MessageKey, {
                              fallbackKo: pending ? "DIBAY 수수료 예정" : "DIBAY 수수료",
                              fallbackEn: pending ? "DIBAY fee (expected)" : "DIBAY fee",
                            })}
                            :{" "}
                            <strong className="tabular-nums">{formatMoneyPhp(row.platformFeeAmount)}</strong>
                          </span>
                          <span>
                            {safeT(netLabelKey as MessageKey, {
                              fallbackKo: pending ? "내 예상 수익" : "내 수익",
                              fallbackEn: pending ? "Your expected net" : "Your net",
                            })}
                            :{" "}
                            <strong className="tabular-nums">{formatMoneyPhp(row.merchantNetAmount)}</strong>
                          </span>
                        </div>
                        <p className="mt-1 text-xs font-medium text-sam-fg">
                          {safeT(statusKey as MessageKey, {
                            fallbackKo: row.reversed
                              ? "환불 / 역분개"
                              : pending
                                ? "수익 확정 대기"
                                : "수익 확정",
                            fallbackEn: row.reversed
                              ? "Refund / reversed"
                              : pending
                                ? "Revenue pending"
                                : "Revenue recognized",
                          })}
                        </p>
                      </button>
                      {open ? (
                        <div
                          className="mt-3 space-y-1 border-t border-sam-border pt-3 text-xs"
                          data-redemption-detail="1"
                        >
                          <p>
                            Order: <span className="font-mono break-all">{row.orderNo || row.orderId}</span>
                          </p>
                          <p>
                            Gift:{" "}
                            <span className="font-mono break-all">
                              {row.publicGiftNumber || row.instanceId}
                            </span>
                          </p>
                          <p>
                            Internal ID: <span className="font-mono break-all">{row.instanceId}</span>
                          </p>
                          <Link
                            href={`${OwnerRoutes.orders(storeId)}${OwnerRoutes.orders(storeId).includes("?") ? "&" : "?"}order_id=${encodeURIComponent(row.orderId)}`}
                            className={`${OWNER_ADMIN_OUTLINE_BTN_CLASS} mt-2 inline-flex`}
                          >
                            {safeT("gift_u5_cta_order", { fallbackKo: "주문 보기", fallbackEn: "View order" })}
                          </Link>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </OwnerStoreAdminDashSection>
    );
  }

  if (view === "cash-out") {
    const amt = Math.trunc(Number(amountStr) || 0);
    return (
      <OwnerStoreAdminDashSection
        title={safeT("gift_owner_cash_out_title", {
          fallbackKo: "수익금 환전 신청",
          fallbackEn: "Request revenue cash-out",
        })}
      >
        {withTabs(
          <>
            <p className="text-sm text-sam-muted">
              {safeT("gift_owner_cash_out_available", {
                fallbackKo: "환전 가능 수익",
                fallbackEn: "Available to cash out",
              })}
              :{" "}
              <span className="font-semibold tabular-nums text-sam-fg">
                {formatMoneyPhp(revenue.availableRevenue)}
              </span>
            </p>
            {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
            <div className="mt-4 space-y-3">
              <label className="block text-sm">
                <span className="text-sam-muted">
                  {safeT("gift_owner_cash_out_amount", { fallbackKo: "신청 금액", fallbackEn: "Amount" })}
                </span>
                <input
                  inputMode="numeric"
                  className="mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 tabular-nums"
                  value={amountStr}
                  disabled={!canCashOut || busy}
                  onChange={(e) => setAmountStr(e.target.value.replace(/[^\d]/g, ""))}
                />
              </label>
              <fieldset className="space-y-2">
                <legend className="text-sm text-sam-muted">
                  {safeT("gift_owner_cash_out_method", { fallbackKo: "지급 방법", fallbackEn: "Payout method" })}
                </legend>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="dest"
                    checked={destType === "gcash"}
                    onChange={() => setDestType("gcash")}
                  />
                  GCash
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="dest"
                    checked={destType === "bank"}
                    onChange={() => setDestType("bank")}
                  />
                  {safeT("gift_owner_cash_out_bank", { fallbackKo: "은행 계좌", fallbackEn: "Bank account" })}
                </label>
              </fieldset>
              {destType === "bank" ? (
                <label className="block text-sm">
                  <span className="text-sam-muted">
                    {safeT("gift_owner_cash_out_bank_name", { fallbackKo: "은행명", fallbackEn: "Bank name" })}
                  </span>
                  <input
                    className="mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2"
                    value={bankName}
                    disabled={busy}
                    onChange={(e) => setBankName(e.target.value)}
                  />
                </label>
              ) : null}
              <label className="block text-sm">
                <span className="text-sam-muted">
                  {destType === "gcash"
                    ? safeT("gift_owner_cash_out_gcash_no", {
                        fallbackKo: "GCash 번호",
                        fallbackEn: "GCash number",
                      })
                    : safeT("gift_owner_cash_out_acct_no", {
                        fallbackKo: "계좌번호",
                        fallbackEn: "Account number",
                      })}
                </span>
                <input
                  className="mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2"
                  value={accountNumber}
                  disabled={busy}
                  onChange={(e) => setAccountNumber(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="text-sam-muted">
                  {safeT("gift_owner_cash_out_acct_name", {
                    fallbackKo: "예금주명",
                    fallbackEn: "Account name",
                  })}
                </span>
                <input
                  className="mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2"
                  value={accountName}
                  disabled={busy}
                  onChange={(e) => setAccountName(e.target.value)}
                />
              </label>
              <button
                type="button"
                className={`${Sam.btn.primary} min-h-[48px] w-full`}
                disabled={!canCashOut || busy || amt <= 0}
                onClick={() => void submitCashOut()}
                data-owner-gift-cash-out-submit="1"
              >
                {safeT("gift_owner_cash_out_submit", {
                  fallbackKo: "환전 신청 확인",
                  fallbackEn: "Confirm cash-out request",
                })}
              </button>
            </div>
          </>
        )}
      </OwnerStoreAdminDashSection>
    );
  }

  if (view === "cash-out-success") {
    return (
      <OwnerStoreAdminDashSection
        title={safeT("gift_owner_cash_out_success_title", {
          fallbackKo: "환전 신청이 접수되었습니다.",
          fallbackEn: "Cash-out request submitted.",
        })}
      >
        <p className="text-sm font-medium" data-owner-gift-cash-out-success="1">
          {safeT("gift_owner_cash_out_success_status", {
            fallbackKo: "Admin 처리 대기",
            fallbackEn: "Awaiting admin processing",
          })}
        </p>
        {lastRequestId ? (
          <p className="mt-2 break-all font-mono text-xs text-sam-muted">ID: {lastRequestId}</p>
        ) : null}
        <div className="mt-4 flex flex-col gap-2">
          <button type="button" className={OWNER_ADMIN_PRIMARY_BTN_CLASS} onClick={() => onGo("history")}>
            {safeT("gift_owner_cta_cash_out_history_only", {
              fallbackKo: "환전 내역 보기",
              fallbackEn: "View cash-out history",
            })}
          </button>
          <button type="button" className={OWNER_ADMIN_OUTLINE_BTN_CLASS} onClick={() => onGo("money")}>
            {safeT("gift_owner_tab_summary", {
              fallbackKo: "수익 요약",
              fallbackEn: "Revenue summary",
            })}
          </button>
        </div>
      </OwnerStoreAdminDashSection>
    );
  }

  if (view === "history" || view === "cash-out-history" || view === "convert-history") {
    return (
      <OwnerStoreAdminDashSection
        title={safeT("gift_owner_history_combined_title", {
          fallbackKo: "환전·전환 내역",
          fallbackEn: "Cash-out & conversion history",
        })}
      >
        {withTabs(renderHistoryLists())}
      </OwnerStoreAdminDashSection>
    );
  }

  if (view === "convert") {
    const amt = Math.trunc(Number(amountStr) || 0);
    const after = Math.max(0, revenue.availableRevenue - Math.max(0, amt));
    return (
      <OwnerStoreAdminDashSection
        title={safeT("gift_u5_convert_title", {
          fallbackKo: "Store Cash 전환 신청",
          fallbackEn: "Request Store Cash conversion",
        })}
      >
        {withTabs(
          <>
            {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
            {!gate.ok ? (
              <p className="mb-3 text-sm text-sam-muted">
                {gate.reason === "recovery_blocked"
                  ? safeT("gift_u5_convert_blocked_recovery", {
                      fallbackKo: "정산 조정 금액이 있어 Cash 전환을 신청할 수 없습니다.",
                      fallbackEn: "A settlement adjustment blocks cash conversion.",
                    })
                  : safeT("gift_u5_convert_blocked_none", {
                      fallbackKo: "전환 가능한 상품권 수익이 없습니다.",
                      fallbackEn: "No gift revenue available to convert.",
                    })}
              </p>
            ) : null}
            <div className="space-y-3" data-owner-gift-convert-form="1">
              <p className="text-sm">
                {safeT("gift_u5_convert_available", {
                  fallbackKo: "사용 가능한 상품권 수익",
                  fallbackEn: "Available gift revenue",
                })}
                : <strong className="tabular-nums">{formatMoneyPhp(revenue.availableRevenue)}</strong>
              </p>
              <p className="text-sm">
                {safeT("gift_u5_convert_cash_now", {
                  fallbackKo: "현재 매장 Cash",
                  fallbackEn: "Current Store Cash",
                })}
                : <strong className="tabular-nums">{formatMoneyPhp(revenue.storeCashBalance)}</strong>
              </p>
              <label className="block text-sm">
                <span className="mb-1 block text-sam-muted">
                  {safeT("gift_u5_convert_amount", {
                    fallbackKo: "전환할 금액",
                    fallbackEn: "Amount to convert",
                  })}
                </span>
                <input
                  inputMode="numeric"
                  className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 tabular-nums"
                  value={amountStr}
                  disabled={!gate.ok || busy}
                  onChange={(e) => setAmountStr(e.target.value.replace(/[^\d]/g, ""))}
                />
              </label>
              <p className="text-xs text-sam-muted">
                {safeT("gift_u5_convert_after", {
                  fallbackKo: "전환 신청 후 남은 수익(예상)",
                  fallbackEn: "Estimated revenue left after request",
                })}
                : <span className="tabular-nums">{formatMoneyPhp(after)}</span>
              </p>
              <button
                type="button"
                className={`${Sam.btn.primary} min-h-[48px] w-full`}
                disabled={!gate.ok || busy}
                onClick={() => void submitConversion()}
                data-owner-gift-convert-submit="1"
              >
                {safeT("gift_u5_convert_submit", {
                  fallbackKo: "Cash 전환 신청",
                  fallbackEn: "Request cash conversion",
                })}
              </button>
            </div>
          </>
        )}
      </OwnerStoreAdminDashSection>
    );
  }

  if (view === "convert-success") {
    return (
      <OwnerStoreAdminDashSection
        title={safeT("gift_u5_convert_success_title", {
          fallbackKo: "Cash 전환 신청이 접수되었습니다.",
          fallbackEn: "Cash conversion request submitted.",
        })}
      >
        <p className="text-sm font-medium" data-owner-gift-convert-success="1">
          {safeT("gift_u5_convert_success_status", {
            fallbackKo: "Admin 승인 대기",
            fallbackEn: "Awaiting admin approval",
          })}
        </p>
        {lastRequestId ? (
          <p className="mt-2 break-all font-mono text-xs text-sam-muted">ID: {lastRequestId}</p>
        ) : null}
        <div className="mt-4 flex flex-col gap-2">
          <button type="button" className={OWNER_ADMIN_PRIMARY_BTN_CLASS} onClick={() => onGo("history")}>
            {safeT("gift_u5_cta_history", {
              fallbackKo: "전환 내역 보기",
              fallbackEn: "View conversion history",
            })}
          </button>
          <button type="button" className={OWNER_ADMIN_OUTLINE_BTN_CLASS} onClick={() => onGo("money")}>
            {safeT("gift_owner_tab_summary", {
              fallbackKo: "수익 요약",
              fallbackEn: "Revenue summary",
            })}
          </button>
        </div>
      </OwnerStoreAdminDashSection>
    );
  }

  // money home
  return (
    <div className="space-y-4" data-owner-gift-money="1">
      <OwnerStoreAdminDashSection
        title={safeT("gift_u5_money_title", {
          fallbackKo: "상품권 수익·현금 관리",
          fallbackEn: "Gift revenue & cash",
        })}
      >
        {withTabs(
          !loaded ? (
            <p className="text-sm text-sam-muted">…</p>
          ) : (
            <>
              {revenue.openRecoveryAmount > 0 ? (
                <p className="mb-3 text-sm text-amber-700" data-owner-gift-recovery="1">
                  {safeT("gift_u5_recovery_notice", {
                    fallbackKo: "환불로 인해 정산 조정 금액이 있습니다.",
                    fallbackEn: "There is a settlement adjustment from a refund.",
                  })}
                </p>
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                {kpiCard(
                  safeT("gift_u5_kpi_merchant_net", {
                    fallbackKo: "확정 상품권 수익",
                    fallbackEn: "Recognized gift revenue",
                  }),
                  formatMoneyPhp(redeemKpis.recognizedMerchantNet),
                  "merchant-net"
                )}
                {kpiCard(
                  safeT("gift_u5_kpi_available", {
                    fallbackKo: "전환 가능 수익",
                    fallbackEn: "Available to convert",
                  }),
                  formatMoneyPhp(revenue.availableRevenue),
                  "available"
                )}
                {kpiCard(
                  safeT("gift_owner_kpi_processing_pending", {
                    fallbackKo: "처리 대기",
                    fallbackEn: "Pending processing",
                  }),
                  formatMoneyPhp(processingPending),
                  "processing-pending",
                  <div className="mt-1 space-y-0.5 text-[11px] text-sam-muted">
                    <p>
                      {safeT("gift_owner_kpi_cash_out_pending", {
                        fallbackKo: "환전 신청 중",
                        fallbackEn: "Cash-out requested",
                      })}
                      : <span className="tabular-nums">{formatMoneyPhp(cashOutPending)}</span>
                    </p>
                    <p>
                      {safeT("gift_u5_kpi_cash_pending", {
                        fallbackKo: "Store Cash 전환 대기",
                        fallbackEn: "Store Cash conversion pending",
                      })}
                      : <span className="tabular-nums">{formatMoneyPhp(pendingConv)}</span>
                    </p>
                  </div>
                )}
                {kpiCard(
                  safeT("gift_u5_kpi_store_cash", { fallbackKo: "매장 Cash", fallbackEn: "Store Cash" }),
                  formatMoneyPhp(revenue.storeCashBalance),
                  "store-cash"
                )}
              </div>
              <div className="mt-4 space-y-2">
                <ActionRow
                  action="cash-out"
                  icon={Banknote}
                  title={safeT("gift_owner_cta_cash_out", {
                    fallbackKo: "수익금 환전 신청",
                    fallbackEn: "Request revenue cash-out",
                  })}
                  desc={safeT("gift_owner_action_cash_out_desc", {
                    fallbackKo: "확정 수익을 GCash·은행으로 환전 신청합니다.",
                    fallbackEn: "Request payout of recognized revenue to GCash or bank.",
                  })}
                  disabled={!canCashOut}
                  reason={cashOutBlockedReason}
                  onClick={() => onGo("cash-out")}
                />
                <ActionRow
                  action="convert"
                  icon={Wallet}
                  title={safeT("gift_u5_cta_convert", {
                    fallbackKo: "Store Cash 전환",
                    fallbackEn: "Store Cash conversion",
                  })}
                  desc={safeT("gift_owner_action_convert_desc", {
                    fallbackKo: "확정 수익을 매장 Cash로 전환 신청합니다.",
                    fallbackEn: "Request converting recognized revenue to Store Cash.",
                  })}
                  disabled={!gate.ok}
                  reason={convertBlockedReason}
                  onClick={() => onGo("convert")}
                />
                <ActionRow
                  action="pending"
                  icon={Clock}
                  title={safeT("gift_owner_action_pending", {
                    fallbackKo: "환전·전환 대기",
                    fallbackEn: "Pending cash-out & conversion",
                  })}
                  desc={safeT("gift_owner_action_pending_desc", {
                    fallbackKo: "신청 중·대기 중인 환전·전환을 확인합니다.",
                    fallbackEn: "Review pending cash-out and conversion requests.",
                  })}
                  onClick={() => onGo("history")}
                />
                <ActionRow
                  action="history"
                  icon={List}
                  title={safeT("gift_owner_action_all_history", {
                    fallbackKo: "전체 내역",
                    fallbackEn: "Full history",
                  })}
                  desc={safeT("gift_owner_action_all_history_desc", {
                    fallbackKo: "환전·전환 전체 내역을 봅니다.",
                    fallbackEn: "View all cash-out and conversion history.",
                  })}
                  onClick={() => onGo("history")}
                />
              </div>
              <Link
                href={OwnerRoutes.points(storeId)}
                className="mt-4 inline-block text-sm text-sam-muted underline underline-offset-2"
              >
                {safeT("gift_u5_link_business_credit", {
                  fallbackKo: "비즈니스 크레딧(운영용) 보기",
                  fallbackEn: "View business credit (operations)",
                })}
              </Link>
            </>
          )
        )}
      </OwnerStoreAdminDashSection>
    </div>
  );
}
