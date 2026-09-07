"use client";

/**
 * Admin Finance transparent LIST panels — Ad funding · Order chain · Conversion settings.
 * Summary strip + tables only (no card dashboard body).
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminActionConfirmDialog } from "@/components/admin/ui/AdminActionConfirmDialog";
import type { AdFundingTrace } from "@/lib/finance/ad-funding-trace/types";
import type { OrderMoneyChain } from "@/lib/finance/order-money-chain/types";
import type { StoreStatement } from "@/lib/finance/store-statement/types";
import type { CoinCashConversionPolicy } from "@/lib/finance/conversion-policy";

function php(n: number): string {
  return `₱${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function cashMinor(n: number): string {
  return php(Math.trunc(n) / 100);
}

export function AdminFinanceTransparentPanels() {
  const { language } = useI18n();
  const ko = language !== "en";
  const searchParams = useSearchParams();
  const storeId = searchParams.get("storeId")?.trim() ?? "";
  const orderIdParam = searchParams.get("orderId")?.trim() ?? "";
  const view = searchParams.get("view")?.trim() ?? "ledger";

  const [tab, setTab] = useState<"ads" | "order" | "statement" | "settings">(
    view === "settings" ? "settings" : orderIdParam ? "order" : "ads"
  );
  const [ads, setAds] = useState<AdFundingTrace[]>([]);
  const [chain, setChain] = useState<OrderMoneyChain | null>(null);
  const [statement, setStatement] = useState<StoreStatement | null>(null);
  const [policy, setPolicy] = useState<CoinCashConversionPolicy | null>(null);
  const [orderId, setOrderId] = useState(orderIdParam);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [draft, setDraft] = useState<Partial<CoinCashConversionPolicy>>({});

  const loadAds = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams({ limit: "50" });
      if (storeId) qs.set("storeId", storeId);
      const res = await fetch(`/api/admin/finance/ad-funding-traces?${qs}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json()) as { ok?: boolean; traces?: AdFundingTrace[]; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error || "load_failed");
        setAds([]);
        return;
      }
      setAds(json.traces ?? []);
    } catch {
      setError("network");
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  const loadChain = useCallback(async () => {
    const oid = orderId.trim();
    if (!oid) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/admin/finance/order-money-chain?orderId=${encodeURIComponent(oid)}`,
        { credentials: "include", cache: "no-store" }
      );
      const json = (await res.json()) as { ok?: boolean; chain?: OrderMoneyChain; error?: string };
      if (!res.ok || !json.ok || !json.chain) {
        setError(json.error || "load_failed");
        setChain(null);
        return;
      }
      setChain(json.chain);
    } catch {
      setError("network");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  const loadStatement = useCallback(async () => {
    if (!storeId.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/admin/finance/store-statement?storeId=${encodeURIComponent(storeId)}&period=30d`,
        { credentials: "include", cache: "no-store" }
      );
      const json = (await res.json()) as {
        ok?: boolean;
        statement?: StoreStatement;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.statement) {
        setError(json.error || "load_failed");
        setStatement(null);
        return;
      }
      setStatement(json.statement);
    } catch {
      setError("network");
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  const loadPolicy = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/finance/conversion-policy", {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json()) as {
        ok?: boolean;
        policy?: CoinCashConversionPolicy;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.policy) {
        setError(json.error || "load_failed");
        return;
      }
      setPolicy(json.policy);
      setDraft(json.policy);
    } catch {
      setError("network");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "ads") void loadAds();
    if (tab === "order" && orderId) void loadChain();
    if (tab === "statement") void loadStatement();
    if (tab === "settings") void loadPolicy();
  }, [tab, loadAds, loadChain, loadStatement, loadPolicy, orderId]);

  const savePolicy = async () => {
    if (!policy || !draft) return;
    setPending(true);
    try {
      const res = await fetch("/api/admin/finance/conversion-policy", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: draft.enabled,
          ratePesosPerPoint: draft.ratePesosPerPoint,
          minimumCoin: draft.minimumCoin,
          conversionUnit: draft.conversionUnit,
          maximumConversionsPerDay: draft.maximumConversionsPerDay,
          maximumConversionsPerWeek: draft.maximumConversionsPerWeek,
          maximumConversionsPerMonth: draft.maximumConversionsPerMonth,
          minimumIntervalHours: draft.minimumIntervalHours,
          dailyLimitCoin: draft.dailyLimitCoin,
          monthlyLimitCoin: draft.monthlyLimitCoin,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        policy?: CoinCashConversionPolicy;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.policy) {
        setError(json.error || "save_failed");
        return;
      }
      setPolicy(json.policy);
      setDraft(json.policy);
      setConfirmOpen(false);
    } finally {
      setPending(false);
    }
  };

  const tabs: Array<{ id: typeof tab; label: string }> = [
    { id: "ads", label: ko ? "광고 지출" : "Ad spend" },
    { id: "order", label: ko ? "주문별 정산" : "Order chain" },
    { id: "statement", label: ko ? "매장 명세" : "Store statement" },
    { id: "settings", label: ko ? "전환 설정" : "Conversion settings" },
  ];

  return (
    <section className="space-y-4" data-admin-finance-transparent="1">
      <div className="flex flex-wrap gap-2 border-b border-sam-border pb-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-ui-rect px-3 py-1.5 sam-text-helper font-medium ${
              tab === t.id
                ? "bg-signature/10 text-signature"
                : "bg-sam-app text-sam-fg border border-sam-border"
            }`}
            data-admin-finance-tab={t.id}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error ? (
        <p className="rounded-ui-rect border border-amber-300 bg-amber-50 px-3 py-2 text-amber-950">
          {error}
        </p>
      ) : null}
      {loading ? <p className="sam-text-body text-sam-muted">{ko ? "불러오는 중…" : "Loading…"}</p> : null}

      {tab === "ads" ? (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[52rem] text-left sam-text-body-secondary">
            <thead className="border-b border-sam-border sam-text-xxs text-sam-muted">
              <tr>
                <th className="px-3 py-2">{ko ? "광고" : "Ad"}</th>
                <th className="px-3 py-2">{ko ? "상품" : "Product"}</th>
                <th className="px-3 py-2">Rail</th>
                <th className="px-3 py-2">{ko ? "금액" : "Amount"}</th>
                <th className="px-3 py-2">{ko ? "상태" : "Status"}</th>
                <th className="px-3 py-2">{ko ? "연결" : "Links"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sam-border-soft">
              {ads.map((r) => (
                <tr key={`${r.family}:${r.adId}`}>
                  <td className="px-3 py-2 font-mono text-xs">{r.adId.slice(0, 8)}…</td>
                  <td className="px-3 py-2">
                    {r.adProduct}
                    {r.legacyLabel ? (
                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                        {r.legacyLabel}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">{r.fundingRail}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {r.walletType === "N_A"
                      ? "—"
                      : r.currency === "POINT"
                        ? `${r.price?.toLocaleString() ?? 0} P`
                        : php(r.price ?? 0)}
                  </td>
                  <td className="px-3 py-2">{r.status}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      {r.adDetailHref ? (
                        <Link href={r.adDetailHref} className="font-semibold text-signature hover:underline">
                          {ko ? "광고" : "Ad"}
                        </Link>
                      ) : null}
                      {r.financeHref ? (
                        <Link href={r.financeHref} className="text-signature hover:underline">
                          {ko ? "원장" : "Ledger"}
                        </Link>
                      ) : (
                        <span className="text-sam-muted">{ko ? "무과금" : "No funding"}</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {ads.length === 0 && !loading ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-sam-muted">
                    {ko ? "광고 자금 내역이 없습니다." : "No ad funding rows."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === "order" ? (
        <div className="space-y-3">
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void loadChain();
            }}
          >
            <input
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              placeholder="Order ID"
              className="min-w-[16rem] flex-1 rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2"
            />
            <button type="submit" className="rounded-ui-rect bg-signature px-4 py-2 text-white">
              {ko ? "조회" : "Load"}
            </button>
          </form>
          {chain ? (
            <div className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
              <header>
                <h3 className="font-semibold text-sam-fg">
                  {chain.storeName} · #{chain.orderNo || chain.orderId.slice(0, 8)}
                </h3>
                <p className="sam-text-helper text-sam-muted">{chain.date}</p>
              </header>
              <div className="overflow-x-auto">
                <table className="w-full text-left sam-text-body-secondary">
                  <thead>
                    <tr className="text-sam-muted">
                      <th className="py-1">{ko ? "상품" : "Item"}</th>
                      <th className="py-1">Qty</th>
                      <th className="py-1">{ko ? "금액" : "Subtotal"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chain.items.map((it) => (
                      <tr key={it.id} className="border-t border-sam-border-soft">
                        <td className="py-1">{it.title}</td>
                        <td className="py-1">{it.qty}</td>
                        <td className="py-1 tabular-nums">{php(it.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <dl className="grid grid-cols-2 gap-2 sam-text-body-secondary sm:grid-cols-4">
                <div>
                  <dt className="text-sam-muted">Gross</dt>
                  <dd className="font-semibold">{php(chain.financial.gross)}</dd>
                </div>
                <div>
                  <dt className="text-sam-muted">{ko ? "수수료" : "Fee"}</dt>
                  <dd className="font-semibold">{php(chain.financial.feeDue)}</dd>
                </div>
                <div>
                  <dt className="text-sam-muted">{ko ? "Cash 차감" : "Cash paid"}</dt>
                  <dd className="font-semibold">{php(chain.financial.cashFeePaid)}</dd>
                </div>
                <div>
                  <dt className="text-sam-muted">{ko ? "미납" : "Outstanding"}</dt>
                  <dd className="font-semibold">{php(chain.financial.outstandingFee)}</dd>
                </div>
                <div>
                  <dt className="text-sam-muted">Coin</dt>
                  <dd className="font-semibold">+{chain.financial.coinEarned.toLocaleString()}</dd>
                </div>
              </dl>
              <ol className="space-y-2 border-t border-sam-border pt-3">
                {chain.timeline.map((ev) => (
                  <li key={ev.id} className="flex flex-wrap items-baseline justify-between gap-2">
                    <span>
                      <span className="font-medium">{ev.label}</span>
                      <span className="ml-2 sam-text-xxs text-sam-muted">{ev.at}</span>
                    </span>
                    <span className="tabular-nums">
                      {ev.amount != null
                        ? ev.wallet === "COIN"
                          ? `${ev.amount.toLocaleString()} Coin`
                          : php(ev.amount)
                        : "—"}
                      {ev.href ? (
                        <Link href={ev.href} className="ml-2 text-signature hover:underline">
                          {ko ? "상세" : "Detail"}
                        </Link>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === "statement" ? (
        <div className="space-y-3">
          {!storeId ? (
            <p className="text-sam-muted">
              {ko ? "URL에 storeId를 넣어 주세요." : "Provide storeId in the URL."}
            </p>
          ) : statement ? (
            <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface p-4">
              <h3 className="mb-3 font-semibold">{statement.storeName}</h3>
              {statement.discrepancies.length > 0 ? (
                <p className="mb-3 rounded border border-amber-400 bg-amber-50 px-2 py-1 text-amber-950">
                  discrepancy: {statement.discrepancies.join(", ")}
                </p>
              ) : null}
              <dl className="grid grid-cols-2 gap-3 sam-text-body-secondary sm:grid-cols-3">
                <div>
                  <dt className="text-sam-muted">Orders / Gross</dt>
                  <dd>
                    {statement.sales.orders} / {php(statement.sales.gross)}
                  </dd>
                </div>
                <div>
                  <dt className="text-sam-muted">{ko ? "수수료 / 미납" : "Fee / Outstanding"}</dt>
                  <dd>
                    {php(statement.sales.settlementFee)} / {php(statement.sales.outstanding)}
                  </dd>
                </div>
                <div>
                  <dt className="text-sam-muted">Coin open → close</dt>
                  <dd>
                    {statement.coin.opening.toLocaleString()} → {statement.coin.closing.toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className="text-sam-muted">Coin earned / convert / withdraw</dt>
                  <dd>
                    +{statement.coin.earned.toLocaleString()} / -{statement.coin.converted.toLocaleString()}{" "}
                    / -{statement.coin.withdrawn.toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className="text-sam-muted">Cash open → close</dt>
                  <dd>
                    {cashMinor(statement.cash.openingMinor)} → {cashMinor(statement.cash.closingMinor)}
                  </dd>
                </div>
                <div>
                  <dt className="text-sam-muted">{ko ? "Cash 유출 분해" : "Cash out breakdown"}</dt>
                  <dd className="space-y-0.5">
                    <div>Sale fee {cashMinor(statement.cash.saleFeeMinor)}</div>
                    <div>Ad spend {cashMinor(statement.cash.adSpendMinor)}</div>
                    <div>Partner {cashMinor(statement.cash.partnerSpendMinor)}</div>
                    <div>Outstanding coll. {cashMinor(statement.cash.outstandingCollectionMinor)}</div>
                  </dd>
                </div>
              </dl>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === "settings" && policy ? (
        <div className="max-w-xl space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <h3 className="font-semibold">{ko ? "Coin → Cash 전환 정책" : "Coin → Cash conversion policy"}</h3>
          <p className="sam-text-helper text-sam-muted">
            {ko
              ? "전환 ≠ 출금. Cash 출금은 없습니다. 저장 전 확인이 필요합니다."
              : "Conversion ≠ withdrawal. Cash withdrawal does not exist. Confirm before save."}
          </p>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={draft.enabled !== false}
              onChange={(e) => setDraft((d) => ({ ...d, enabled: e.target.checked }))}
            />
            {ko ? "사용" : "Enabled"}
          </label>
          {(
            [
              ["ratePesosPerPoint", ko ? "비율 (Coin→PHP)" : "Rate"],
              ["minimumCoin", ko ? "최소 Coin" : "Minimum Coin"],
              ["conversionUnit", ko ? "환전 단위" : "Unit"],
              ["maximumConversionsPerDay", ko ? "일 횟수 한도" : "Daily count"],
              ["maximumConversionsPerWeek", ko ? "주 횟수 한도" : "Weekly count"],
              ["maximumConversionsPerMonth", ko ? "월 횟수 한도" : "Monthly count"],
              ["minimumIntervalHours", ko ? "최소 간격(시간)" : "Min interval (h)"],
              ["dailyLimitCoin", ko ? "일 Coin 한도" : "Daily Coin cap"],
              ["monthlyLimitCoin", ko ? "월 Coin 한도" : "Monthly Coin cap"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block">
              <span className="sam-text-helper text-sam-muted">{label}</span>
              <input
                type="number"
                className="mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2"
                value={
                  draft[key] == null || Number.isNaN(Number(draft[key]))
                    ? ""
                    : String(draft[key])
                }
                onChange={(e) => {
                  const raw = e.target.value;
                  setDraft((d) => ({
                    ...d,
                    [key]: raw === "" ? null : Number(raw),
                  }));
                }}
              />
            </label>
          ))}
          <button
            type="button"
            className="rounded-ui-rect bg-signature px-4 py-2 text-white"
            onClick={() => setConfirmOpen(true)}
          >
            {ko ? "저장" : "Save"}
          </button>
          <AdminActionConfirmDialog
            open={confirmOpen}
            title={ko ? "Coin → Cash 전환 정책을 변경하시겠습니까?" : "Change Coin→Cash policy?"}
            description={
              ko
                ? `현재 v${policy.version} → 새 설정이 이후 전환부터 적용됩니다. 과거 원장에는 소급되지 않습니다.`
                : `Current v${policy.version} → new settings apply to future conversions only.`
            }
            confirmLabel={ko ? "변경" : "Change"}
            cancelLabel={ko ? "취소" : "Cancel"}
            pending={pending}
            onCancel={() => setConfirmOpen(false)}
            onConfirm={() => void savePolicy()}
          />
        </div>
      ) : null}
    </section>
  );
}
