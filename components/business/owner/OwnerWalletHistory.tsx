"use client";

/**
 * 사장님 Coin·Cash 기간 내역 — 기간 선택 · 기간 합계(「Coin 전환 얼마 · 출금 얼마」) · 날짜별 목록 · 페이지 (Owner 2026-11-03).
 * 합계는 서버가 고른 기간 전체로 계산한다 (`/finance/history` → lib/finance/wallet-period-history).
 * @see docs/audit/currency-history-screens-design-2026-11-03.md §2·§3
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { CurrencyHistoryRow } from "@/components/currency";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { CommissionPeriodFilter, LedgerPager } from "@/components/stores/commission/StoreCommissionLedgerParts";
import { formatFinanceAmount } from "@/lib/finance/presentation";
import type { CashPeriodSummary, CoinPeriodSummary, WalletHistoryRow, WalletKind } from "@/lib/finance/wallet-period-history";
import {
  customPeriodInputState,
  OWNER_MONEY_PERIODS,
  type StoreCommissionPeriod,
} from "@/lib/stores/commission/store-commission-ledger-query";

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

/**
 * 잔액에 준 영향의 부호대로 표시 (재감사 R3-a·b — 이전: 절댓값에 「−」 고정이라 환원·환급이 더 크면 부호가 반대).
 * `effect` > 0 = 잔액이 늘어남(+), < 0 = 줄어듦(−).
 */
function signedBalanceEffect(effect: number, fmt: (abs: number) => string): string {
  if (effect === 0) return fmt(0);
  return `${effect > 0 ? "+" : "−"}${fmt(Math.abs(effect))}`;
}

export function coinTiles(s: CoinPeriodSummary, ko: boolean): Tile[] {
  const fmt = (n: number) => formatFinanceAmount({ wallet: "COIN", amount: n });
  const c = (effect: number) => signedBalanceEffect(effect, fmt);
  const tiles: Tile[] = [
    { key: "earned", label: ko ? "Coin 적립" : "Earned", value: c(s.sums.earned), category: "earned" },
    { key: "converted", label: ko ? "Cash 로 전환" : "Converted to Cash", value: c(-s.sums.converted), category: "converted" },
    {
      key: "withdrawn",
      label: ko ? "Coin 출금 (신청 − 반려 환원)" : "Withdrawn (requests − returns)",
      value: c(-s.sums.withdrawn),
      category: "withdrawn",
    },
    {
      key: "paid",
      // 잔액 변화가 아니라 지급 사실 — 지급 완료 시각 기준 금액 (출금 칸에 이미 신청 때 빠짐)
      label: ko ? "출금 지급 완료 (지급 시각 기준)" : "Withdrawal paid (by paid time)",
      value: s.withdrawalPaid == null ? "—" : fmt(s.withdrawalPaid),
      category: "paid",
    },
  ];
  if (s.sums.adjusted !== 0) {
    tiles.push({ key: "adjusted", label: ko ? "관리자 조정" : "Admin adjustment", value: c(s.sums.adjusted), category: "adjusted" });
  }
  if (s.sums.reversed !== 0) {
    tiles.push({ key: "reversed", label: ko ? "취소 반전" : "Reversed", value: c(-s.sums.reversed), category: "reversed" });
  }
  // 분류표에 없는 종류도 숨기지 않는다 — 칸 합 = 종료 − 시작 (R3-c)
  if (s.sums.other !== 0) {
    tiles.push({ key: "other", label: ko ? "기타" : "Other", value: c(s.sums.other), category: null });
  }
  return tiles;
}

export function cashTiles(s: CashPeriodSummary, ko: boolean, adsOnly: boolean): Tile[] {
  const fmt = (minor: number) => formatFinanceAmount({ wallet: "CASH", amount: minor, isMinor: true });
  const p = (effect: number) => signedBalanceEffect(effect, fmt);
  const ads: Tile[] = [
    { key: "ad", label: ko ? "광고 지출" : "Ad spend", value: p(-s.adSpendMinor), category: "ads" },
    { key: "partner", label: ko ? "Partner 지출" : "Partner spend", value: p(-s.partnerSpendMinor), category: "ads" },
    { key: "refund", label: ko ? "광고·Partner 환불" : "Refunds", value: p(s.refundMinor), category: "ads" },
  ];
  if (adsOnly) return ads;
  const tiles: Tile[] = [
    { key: "topup", label: ko ? "Cash 충전" : "Top-up", value: p(s.topupMinor), category: "topup" },
    { key: "conv", label: ko ? "Coin 전환 입금" : "From Coin", value: p(s.fromConversionMinor), category: "fromConversion" },
    {
      key: "fee",
      label: ko ? "판매 수수료 (부과·미납 납부 − 환급)" : "Sale fees (charged + settled − refunded)",
      value: p(s.saleFeeReversalMinor - s.saleFeeMinor - s.outstandingCollectionMinor),
      category: "saleFee",
    },
    ...ads,
  ];
  if (s.adjustmentCreditMinor !== 0 || s.adjustmentDebitMinor !== 0) {
    tiles.push({
      key: "adj",
      label: ko ? "관리자 조정" : "Admin adjustment",
      value: p(s.adjustmentCreditMinor - s.adjustmentDebitMinor),
      category: "adjusted",
    });
  }
  if (s.otherCreditMinor !== 0 || s.otherDebitMinor !== 0) {
    tiles.push({ key: "other", label: ko ? "기타" : "Other", value: p(s.otherCreditMinor - s.otherDebitMinor), category: null });
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
  /** 늦게 온 이전 응답이 새 기간·쪽 결과를 덮지 않게 (재감사 R5-a) */
  const requestSeq = useRef(0);
  const customState = period.period === "custom" ? customPeriodInputState(period.fromDay, period.toDay) : "ok";

  const load = useCallback(
    async (silent?: boolean) => {
      const seq = ++requestSeq.current;
      if (customState !== "ok") {
        // 날짜가 다 정해지기 전에는 조회하지 않고, 앞 기간 값도 보이지 않게 (R4-c)
        setData(null);
        setError(false);
        setLoading(false);
        return;
      }
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
        if (seq !== requestSeq.current) return;
        if (!res.ok || !json?.ok) {
          // 조용한 재조회 실패 → 보던 내역은 두고 오류 띠만 (R8 · P-7)
          if (!silent) setData(null);
          setError(true);
          return;
        }
        setError(false);
        setData(json);
      } catch {
        if (seq !== requestSeq.current) return;
        if (!silent) setData(null);
        setError(true);
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    },
    [adsOnly, category, customState, offset, period, storeId, wallet]
  );

  useEffect(() => {
    void load();
  }, [load]);
  // 부모(잔액 화면)가 앱 복귀·처리 결과 알림 때 reloadKey 를 올린다 — 재조회는 부모 한 곳에서만(R5-b).
  // 처음 붙을 때의 reloadKey 는 무시(탭 이동 때 첫 조회와 겹쳐 2~3번 읽던 문제).
  const mountedReloadKey = useRef(reloadKey);
  useEffect(() => {
    if (reloadKey !== mountedReloadKey.current) void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 부모 재조회 신호에만 반응
  }, [reloadKey]);

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

      {customState !== "ok" ? (
        <p className="text-sm text-sam-muted" role="status" data-owner-wallet-custom={customState}>
          {customState === "inverted"
            ? ko
              ? "시작일이 종료일보다 늦습니다. 날짜를 다시 골라 주세요."
              : "Start date is after end date. Pick the dates again."
            : ko
              ? "시작일과 종료일을 모두 고르면 내역을 보여 드립니다."
              : "Pick both start and end dates to see the history."}
        </p>
      ) : null}

      {s ? (
        <div className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-app px-3 py-3" data-owner-wallet-summary={wallet}>
          <p className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="text-sam-muted">
              {adsOnly ? (ko ? "기간 시작 Cash 잔액 (전체)" : "Opening Cash balance (all)") : ko ? "기간 시작 잔액" : "Opening"}
            </span>
            <span className="font-semibold tabular-nums">{opening == null ? "—" : fmtBal(opening)}</span>
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {tiles.map((tile) => {
              const active = !adsOnly && tile.category != null && category === tile.category;
              return (
                <button
                  key={tile.key}
                  type="button"
                  disabled={adsOnly || tile.category == null}
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
            <span className="text-sam-muted">
              {adsOnly ? (ko ? "기간 종료 Cash 잔액 (전체)" : "Closing Cash balance (all)") : ko ? "기간 종료 잔액" : "Closing"}
            </span>
            <span className="font-semibold tabular-nums">{closing == null ? "—" : fmtBal(closing)}</span>
          </p>
          {adsOnly ? (
            <p className="text-xs text-sam-muted">
              {ko
                ? "시작·종료 잔액은 Cash 전체 기준입니다. 위 칸은 광고·Partner 지출과 환불만 합한 값입니다."
                : "Opening/closing are for all Cash. The totals above cover ad/Partner spend and refunds only."}
            </p>
          ) : null}
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
        <p className="text-sm text-sam-danger" role="alert">
          {data
            ? ko
              ? "최신 내역을 불러오지 못했습니다. 아래는 앞서 불러온 내역입니다."
              : "Could not refresh. Showing the last loaded history."
            : ko
              ? "내역을 불러오지 못했습니다."
              : "Could not load history."}
        </p>
      ) : null}
      {customState !== "ok" || (error && !data) ? null : loading && !data ? (
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
                  const paid =
                    row.referenceAmount != null
                      ? `${ko ? "지급액" : "Paid"} ${formatFinanceAmount({ wallet: "COIN", amount: row.referenceAmount })}`
                      : null;
                  const bal = [paid, `${ko ? "잔액" : "Balance"} ${fmtBal(row.balanceAfter)}`].filter(Boolean).join(" · ");
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
