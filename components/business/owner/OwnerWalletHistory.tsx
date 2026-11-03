"use client";

/**
 * 사장님 Coin·Cash 기간 내역 — 기간 선택 · 기간 합계(「Coin 전환 얼마 · 출금 얼마」) · 날짜별 목록 · 페이지 (Owner 2026-11-03).
 * 합계는 서버가 고른 기간 전체로 계산한다 (`/finance/history` → lib/finance/wallet-period-history).
 * @see docs/audit/currency-history-screens-design-2026-11-03.md §2·§3
 */
import { useCallback, useEffect, useState } from "react";
import { CurrencyHistoryRow } from "@/components/currency";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { CommissionPeriodFilter, LedgerPager } from "@/components/stores/commission/StoreCommissionLedgerParts";
import { formatFinanceAmount } from "@/lib/finance/presentation";
import type { CashPeriodSummary, CoinPeriodSummary, WalletHistoryRow, WalletKind } from "@/lib/finance/wallet-period-history";
import { OWNER_MONEY_PERIODS, type StoreCommissionPeriod } from "@/lib/stores/commission/store-commission-ledger-query";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";

const PAGE_SIZE = 20;
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];
const WEEKDAY_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** 날짜 묶음 머리줄 (PHT) — 「11월 3일 (화)」 */
export function manilaDayHeader(iso: string, ko: boolean): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "—";
  const d = new Date(ms + MANILA_OFFSET_MS);
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const w = d.getUTCDay();
  return ko ? `${d.getUTCFullYear()}년 ${m}월 ${day}일 (${WEEKDAY_KO[w]})` : `${WEEKDAY_EN[w]}, ${m}/${day}/${d.getUTCFullYear()}`;
}

type Payload = {
  ok?: boolean;
  error?: string;
  summary?: CoinPeriodSummary | CashPeriodSummary;
  rows?: WalletHistoryRow[];
  total?: number;
};

type Tile = { key: string; label: string; value: string; category: string | null };

function coinTiles(s: CoinPeriodSummary, ko: boolean): Tile[] {
  const c = (n: number, sign: "+" | "−" | "") => `${sign}${formatFinanceAmount({ wallet: "COIN", amount: Math.abs(n) })}`;
  const tiles: Tile[] = [
    { key: "earned", label: ko ? "Coin 적립" : "Earned", value: c(s.sums.earned, "+"), category: "earned" },
    { key: "converted", label: ko ? "Cash 로 전환" : "Converted to Cash", value: c(s.sums.converted, "−"), category: "converted" },
    { key: "withdrawn", label: ko ? "Coin 출금 (신청 − 반려 환원)" : "Withdrawn (net)", value: c(s.sums.withdrawn, "−"), category: "withdrawn" },
    {
      key: "paid",
      label: ko ? "출금 지급 완료" : "Withdrawal paid",
      value: s.withdrawalPaid == null ? "—" : formatFinanceAmount({ wallet: "COIN", amount: s.withdrawalPaid }),
      category: "withdrawn",
    },
  ];
  if (s.sums.adjusted !== 0) {
    tiles.push({
      key: "adjusted",
      label: ko ? "관리자 조정" : "Admin adjustment",
      value: c(s.sums.adjusted, s.sums.adjusted < 0 ? "−" : "+"),
      category: "adjusted",
    });
  }
  if (s.sums.reversed !== 0) {
    tiles.push({ key: "reversed", label: ko ? "취소 반전" : "Reversed", value: c(s.sums.reversed, "−"), category: "reversed" });
  }
  return tiles;
}

function cashTiles(s: CashPeriodSummary, ko: boolean, adsOnly: boolean): Tile[] {
  const p = (minor: number, sign: "+" | "−") => `${sign}${formatFinanceAmount({ wallet: "CASH", amount: minor, isMinor: true })}`;
  const ads: Tile[] = [
    { key: "ad", label: ko ? "광고 지출" : "Ad spend", value: p(s.adSpendMinor, "−"), category: "ads" },
    { key: "partner", label: ko ? "Partner 지출" : "Partner spend", value: p(s.partnerSpendMinor, "−"), category: "ads" },
    { key: "refund", label: ko ? "광고·Partner 환불" : "Refunds", value: p(s.refundMinor, "+"), category: "ads" },
  ];
  if (adsOnly) return ads;
  const tiles: Tile[] = [
    { key: "topup", label: ko ? "Cash 충전" : "Top-up", value: p(s.topupMinor, "+"), category: "topup" },
    { key: "conv", label: ko ? "Coin 전환 입금" : "From Coin", value: p(s.fromConversionMinor, "+"), category: "fromConversion" },
    {
      key: "fee",
      label: ko ? "판매 수수료" : "Sale fees",
      value: p(s.saleFeeMinor + s.outstandingCollectionMinor - s.saleFeeReversalMinor, "−"),
      category: "saleFee",
    },
    ...ads,
  ];
  if (s.adjustmentCreditMinor !== 0 || s.adjustmentDebitMinor !== 0) {
    const net = s.adjustmentCreditMinor - s.adjustmentDebitMinor;
    tiles.push({
      key: "adj",
      label: ko ? "관리자 조정" : "Admin adjustment",
      value: p(Math.abs(net), net < 0 ? "−" : "+"),
      category: "adjusted",
    });
  }
  return tiles;
}

export function OwnerWalletHistory({
  storeId,
  wallet,
  adsOnly = false,
  reloadKey = 0,
  titleFor,
  referenceFor,
  detailHrefFor,
}: {
  storeId: string;
  wallet: WalletKind;
  /** 「광고 지출」 탭 — Cash 중 광고·Partner 종류만 */
  adsOnly?: boolean;
  /** 부모가 잔액을 다시 읽을 때 같이 다시 읽기 */
  reloadKey?: number;
  titleFor: (entryKind: string) => string;
  referenceFor: (row: WalletHistoryRow) => string | null;
  /** 줄을 누르면 갈 곳 (출금 신청·충전·수수료 상세) */
  detailHrefFor?: (row: WalletHistoryRow) => string | undefined;
}) {
  const { language } = useI18n();
  const ko = language !== "en";
  const lang = ko ? "ko" : "en";
  const [period, setPeriod] = useState<{ period: StoreCommissionPeriod; fromDay: string; toDay: string }>({
    period: "this_month",
    fromDay: "",
    toDay: "",
  });
  const [category, setCategory] = useState<string | null>(adsOnly ? "ads" : null);
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(
    async (silent?: boolean) => {
      if (period.period === "custom" && (!period.fromDay || !period.toDay)) return;
      if (!silent) setLoading(true);
      try {
        const qs = new URLSearchParams({ wallet, period: period.period, offset: String(offset), limit: String(PAGE_SIZE) });
        if (period.period === "custom") {
          qs.set("from", period.fromDay);
          qs.set("to", period.toDay);
        }
        const cat = adsOnly ? "ads" : category;
        if (cat) qs.set("category", cat);
        const res = await fetch(`/api/me/stores/${encodeURIComponent(storeId)}/finance/history?${qs.toString()}`, {
          credentials: "include",
        });
        const json = (await res.json().catch(() => null)) as Payload | null;
        if (!res.ok || !json?.ok) {
          setError(true);
          return;
        }
        setError(false);
        setData(json);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    },
    [adsOnly, category, offset, period, storeId, wallet]
  );

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (reloadKey > 0) void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 부모 재조회 신호에만 반응
  }, [reloadKey]);
  const refetchSilently = useCallback(() => load(true), [load]);
  useRefetchOnPageShowRestore(refetchSilently, { enableWindowFocusRefetch: true });

  const s = data?.summary;
  const tiles = !s ? [] : s.wallet === "coin" ? coinTiles(s, ko) : cashTiles(s, ko, adsOnly);
  const fmtBal = (n: number) =>
    wallet === "coin" ? formatFinanceAmount({ wallet: "COIN", amount: n }) : formatFinanceAmount({ wallet: "CASH", amount: n, isMinor: true });
  const opening = !s ? null : s.wallet === "coin" ? s.opening : s.openingMinor;
  const closing = !s ? null : s.wallet === "coin" ? s.closing : s.closingMinor;
  const rows = data?.rows ?? [];

  // 날짜별 묶음 (PHT)
  const groups: Array<{ day: string; rows: WalletHistoryRow[] }> = [];
  for (const r of rows) {
    const day = manilaDayHeader(r.createdAt, ko);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.rows.push(r);
    else groups.push({ day, rows: [r] });
  }

  return (
    <div className="space-y-3" data-owner-wallet-history={wallet}>
      <CommissionPeriodFilter
        period={period.period}
        fromDay={period.fromDay}
        toDay={period.toDay}
        lang={lang}
        periods={OWNER_MONEY_PERIODS}
        onChange={(next) => {
          setOffset(0);
          setPeriod(next);
        }}
      />

      {s ? (
        <div className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-app px-3 py-3" data-owner-wallet-summary={wallet}>
          <p className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="text-sam-muted">{ko ? "기간 시작 잔액" : "Opening"}</span>
            <span className="font-semibold tabular-nums">{opening == null ? "—" : fmtBal(opening)}</span>
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {tiles.map((tile) => {
              const active = !adsOnly && tile.category != null && category === tile.category;
              return (
                <button
                  key={tile.key}
                  type="button"
                  disabled={adsOnly}
                  onClick={() => {
                    setOffset(0);
                    setCategory(active ? null : tile.category);
                  }}
                  aria-pressed={active}
                  className={`rounded-ui-rect border px-3 py-2 text-left active:brightness-95 ${
                    active ? "border-sam-primary bg-sam-primary-soft" : "border-sam-border bg-sam-surface"
                  }`}
                  data-owner-wallet-tile={tile.key}
                >
                  <span className="block text-xs text-sam-muted">{tile.label}</span>
                  <span className="block font-semibold tabular-nums">{tile.value}</span>
                </button>
              );
            })}
          </div>
          <p className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="text-sam-muted">{ko ? "기간 종료 잔액" : "Closing"}</span>
            <span className="font-semibold tabular-nums">{closing == null ? "—" : fmtBal(closing)}</span>
          </p>
          {!s.reconciled ? (
            <p className="text-xs text-sam-danger" role="alert">
              {ko ? "내역 합계가 맞지 않습니다. 고객센터에 알려 주세요." : "History totals do not reconcile. Please contact support."}
            </p>
          ) : null}
          {s.truncated ? (
            <p className="text-xs text-sam-danger" role="alert">
              {ko ? "기간 안 내역이 너무 많아 합계가 일부만 계산됐습니다. 기간을 줄여 주세요." : "Too many entries — totals are partial. Narrow the period."}
            </p>
          ) : null}
          {!adsOnly ? (
            <p className="text-xs text-sam-muted">
              {category
                ? ko
                  ? "고른 칸의 내역만 보는 중입니다. 같은 칸을 다시 누르면 전체를 봅니다."
                  : "Showing the selected type only. Tap it again to show all."
                : ko
                  ? "칸을 누르면 그 종류의 내역만 봅니다."
                  : "Tap a total to filter the list."}
            </p>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-sam-danger">{ko ? "내역을 불러오지 못했습니다." : "Could not load history."}</p>
      ) : loading && !data ? (
        <p className="text-sm text-sam-muted">{ko ? "불러오는 중…" : "Loading…"}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-sam-muted">{ko ? "이 기간에 내역이 없습니다." : "No entries in this period."}</p>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <section key={g.day} aria-label={g.day}>
              <h3 className="mb-1.5 text-xs font-semibold text-sam-muted">{g.day}</h3>
              <ul className="space-y-2">
                {g.rows.map((row) => {
                  const ref = referenceFor(row);
                  const bal = `${ko ? "잔액" : "Balance"} ${fmtBal(row.balanceAfter)}`;
                  return (
                    <CurrencyHistoryRow
                      key={row.id}
                      currency={wallet}
                      title={titleFor(row.entryKind)}
                      amount={row.signedAmount}
                      isMinor={wallet === "cash"}
                      signed
                      createdAt={row.createdAt}
                      reference={ref ? `${ref} · ${bal}` : bal}
                      detailHref={detailHrefFor?.(row)}
                    />
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <LedgerPager
        offset={offset}
        pageSize={PAGE_SIZE}
        total={data?.total ?? 0}
        loading={loading}
        onChange={setOffset}
        lang={lang}
      />
    </div>
  );
}
