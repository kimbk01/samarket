"use client";

/**
 * 사장님 Coin·Cash 기간 내역 — 기간 선택 · 기간 합계(「Coin 전환 얼마 · 출금 얼마」) · 날짜별 목록 · 페이지 (Owner 2026-11-03).
 * 합계는 서버가 고른 기간 전체로 계산한다 (`/finance/history` → lib/finance/wallet-period-history).
 * @see docs/audit/currency-history-screens-design-2026-11-03.md §2·§3
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CurrencyHistoryRow } from "@/components/currency";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { translateBy } from "@/lib/i18n/translate-by";
import { CommissionPeriodFilter, LedgerPager } from "@/components/stores/commission/StoreCommissionLedgerParts";
import { formatFinanceAmount } from "@/lib/finance/presentation";
import type { CashPeriodSummary, CoinPeriodSummary, WalletHistoryRow, WalletKind } from "@/lib/finance/wallet-period-history";
import {
  parseOwnerWalletHistoryUrlState,
  writeOwnerWalletHistoryUrlState,
} from "@/lib/finance/owner-wallet-history-url-state";
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
  return translateBy(ko ? "ko" : "en", "owner_wallet_day_header", {
    y: d.getUTCFullYear(),
    m,
    day,
    weekday: (ko ? WEEKDAY_KO : WEEKDAY_EN)[w],
  });
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
  const L = (key: Parameters<typeof translateBy>[1]) => translateBy(ko ? "ko" : "en", key);
  const fmt = (n: number) => formatFinanceAmount({ wallet: "COIN", amount: n });
  const c = (effect: number) => signedBalanceEffect(effect, fmt);
  const tiles: Tile[] = [
    { key: "earned", label: L("owner_wallet_tile_earned"), value: c(s.sums.earned), category: "earned" },
    { key: "converted", label: L("owner_wallet_tile_converted"), value: c(-s.sums.converted), category: "converted" },
    {
      key: "withdrawn",
      label: L("owner_wallet_tile_withdrawn"),
      value: c(-s.sums.withdrawn),
      category: "withdrawn",
    },
    {
      key: "paid",
      // 잔액 변화가 아니라 지급 사실 — 지급 완료 시각 기준 금액 (출금 칸에 이미 신청 때 빠짐)
      label: L("owner_wallet_tile_paid"),
      value: s.withdrawalPaid == null ? "—" : fmt(s.withdrawalPaid),
      category: "paid",
    },
  ];
  if (s.sums.adjusted !== 0) {
    tiles.push({ key: "adjusted", label: L("owner_wallet_tile_admin_adjust"), value: c(s.sums.adjusted), category: "adjusted" });
  }
  if (s.sums.reversed !== 0) {
    tiles.push({ key: "reversed", label: L("owner_wallet_tile_reversed"), value: c(-s.sums.reversed), category: "reversed" });
  }
  // 분류표에 없는 종류도 숨기지 않는다 — 칸 합 = 종료 − 시작 (R3-c)
  if (s.sums.other !== 0) {
    tiles.push({ key: "other", label: L("owner_wallet_tile_other"), value: c(s.sums.other), category: null });
  }
  return tiles;
}

export function cashTiles(s: CashPeriodSummary, ko: boolean, adsOnly: boolean): Tile[] {
  const L = (key: Parameters<typeof translateBy>[1]) => translateBy(ko ? "ko" : "en", key);
  const fmt = (minor: number) => formatFinanceAmount({ wallet: "CASH", amount: minor, isMinor: true });
  const p = (effect: number) => signedBalanceEffect(effect, fmt);
  const ads: Tile[] = [
    // 칸마다 거르기를 따로 — 하나를 누르면 그 칸만 눌림 (D-7). 「광고 지출」 탭(adsOnly)은 칸 비활성·거르기 ads 고정.
    { key: "ad", label: L("owner_wallet_tile_ad_spend"), value: p(-s.adSpendMinor), category: "adSpend" },
    { key: "partner", label: L("owner_wallet_tile_partner_spend"), value: p(-s.partnerSpendMinor), category: "partnerSpend" },
    { key: "refund", label: L("owner_wallet_tile_refunds"), value: p(s.refundMinor), category: "adRefund" },
  ];
  if (adsOnly) return ads;
  const tiles: Tile[] = [
    { key: "topup", label: L("owner_wallet_tile_topup"), value: p(s.topupMinor), category: "topup" },
    { key: "conv", label: L("owner_wallet_tile_from_coin"), value: p(s.fromConversionMinor), category: "fromConversion" },
    {
      key: "fee",
      label: L("owner_wallet_tile_sale_fees"),
      value: p(s.saleFeeReversalMinor - s.saleFeeMinor - s.outstandingCollectionMinor),
      category: "saleFee",
    },
    ...ads,
  ];
  if (s.adjustmentCreditMinor !== 0 || s.adjustmentDebitMinor !== 0) {
    tiles.push({
      key: "adj",
      label: L("owner_wallet_tile_admin_adjust"),
      value: p(s.adjustmentCreditMinor - s.adjustmentDebitMinor),
      category: "adjusted",
    });
  }
  if (s.otherCreditMinor !== 0 || s.otherDebitMinor !== 0) {
    tiles.push({ key: "other", label: L("owner_wallet_tile_other"), value: p(s.otherCreditMinor - s.otherDebitMinor), category: null });
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
  const { t, language } = useI18n();
  const ko = language !== "en";
  const lang = ko ? "ko" : "en";
  /** 주소에 남긴 기간·칸·쪽 — 「자세히」 갔다 돌아오면 그대로 (D-13 · 회원 포인트 화면과 같은 방식) */
  const searchParams = useSearchParams();
  const [urlInit] = useState(() => parseOwnerWalletHistoryUrlState(searchParams, { wallet, adsOnly }));
  const [period, setPeriod] = useState<{ period: StoreCommissionPeriod; fromDay: string; toDay: string }>(urlInit.period);
  const [category, setCategory] = useState<string | null>(urlInit.category);
  const [offset, setOffset] = useState(urlInit.page * PAGE_SIZE);
  const [data, setData] = useState<Payload | null>(null);
  /**
   * 기간 합계는 기간이 바뀔 때만 다시 받는다 (재감사 P-1 · 이전: 쪽·칸을 넘길 때마다 서버가 기간 전체를 다시 합산).
   * 칸·쪽 이동은 목록만 받고 이 합계를 그대로 쓴다. 조용한 재조회(알림·앱 복귀)는 합계도 새로.
   */
  const [summary, setSummary] = useState<Payload["summary"] | null>(null);
  const summaryKeyRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  /** 늦게 온 이전 응답이 새 기간·쪽 결과를 덮지 않게 (재감사 R5-a) */
  const requestSeq = useRef(0);
  const customState = period.period === "custom" ? customPeriodInputState(period.fromDay, period.toDay) : "ok";

  /** 기간·칸·쪽 → 주소 (replaceState · 기록 쌓지 않음 · D-13) */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const next = writeOwnerWalletHistoryUrlState(
      window.location.search,
      { period, category, page: Math.floor(offset / PAGE_SIZE) },
      { wallet, adsOnly }
    );
    const cur = window.location.search.replace(/^\?/, "");
    if (next === cur) return;
    window.history.replaceState(null, "", `${window.location.pathname}${next ? `?${next}` : ""}${window.location.hash}`);
  }, [adsOnly, category, offset, period, wallet]);

  const load = useCallback(
    async (silent?: boolean) => {
      const seq = ++requestSeq.current;
      const periodKey = `${period.period}|${period.fromDay}|${period.toDay}`;
      if (customState !== "ok") {
        // 날짜가 다 정해지기 전에는 조회하지 않고, 앞 기간 값도 보이지 않게 (R4-c)
        setData(null);
        setSummary(null);
        summaryKeyRef.current = null;
        setError(false);
        setLoading(false);
        return;
      }
      // 기간·칸·쪽이 바뀐 조회는 앞 조회의 합계·목록을 지우고 「불러오는 중」 — 새 칩 아래 이전 값이 보이지 않게 (D-5).
      // 조용한 재조회(부모 reloadKey: 앱 복귀·처리 결과 알림)만 이전 값을 유지한다.
      const needSummary = Boolean(silent) || summaryKeyRef.current !== periodKey;
      if (!silent) {
        setData(null);
        if (needSummary) setSummary(null);
        setError(false);
        setLoading(true);
      }
      try {
        const qs = new URLSearchParams({ wallet, period: period.period, offset: String(offset), limit: String(PAGE_SIZE) });
        if (period.period === "custom") {
          qs.set("from", period.fromDay);
          qs.set("to", period.toDay);
        }
        const cat = adsOnly ? "ads" : category;
        if (cat) qs.set("category", cat);
        if (!needSummary) qs.set("summary", "0");
        const res = await fetch(`/api/me/stores/${encodeURIComponent(storeId)}/finance/history?${qs.toString()}`, {
          credentials: "include",
        });
        const json = (await res.json().catch(() => null)) as Payload | null;
        if (seq !== requestSeq.current) return;
        if (!res.ok || !json?.ok) {
          // 조용한 재조회 실패 → 보던 내역은 두고 오류 띠만 (R8 · P-7)
          if (!silent) {
            setData(null);
            if (needSummary) setSummary(null);
          }
          setError(true);
          return;
        }
        setError(false);
        setData(json);
        if (json.summary) {
          setSummary(json.summary);
          summaryKeyRef.current = periodKey;
        }
      } catch {
        if (seq !== requestSeq.current) return;
        if (!silent) {
          setData(null);
          if (needSummary) setSummary(null);
        }
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

  const s = summary;
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
            ? t("owner_wallet_custom_inverted")
            : t("owner_wallet_custom_incomplete")}
        </p>
      ) : null}

      {s ? (
        <div className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-app px-3 py-3" data-owner-wallet-summary={wallet}>
          <p className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="text-sam-muted">
              {adsOnly ? t("owner_wallet_opening_cash_all") : t("owner_wallet_opening")}
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
              {adsOnly ? t("owner_wallet_closing_cash_all") : t("owner_wallet_closing")}
            </span>
            <span className="font-semibold tabular-nums">{closing == null ? "—" : fmtBal(closing)}</span>
          </p>
          {adsOnly ? (
            <p className="text-xs text-sam-muted">
              {t("owner_wallet_ads_only_note")}
            </p>
          ) : null}
          {!s.reconciled ? (
            <p className="text-xs text-sam-danger" role="alert">
              {t("owner_wallet_not_reconciled")}
            </p>
          ) : null}
          {!adsOnly ? (
            <p className="text-xs text-sam-muted">
              {category
                ? t("owner_wallet_filter_selected_hint")
                : t("owner_wallet_filter_hint")}
            </p>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-sam-danger" role="alert">
          {data
            ? t("owner_wallet_refresh_failed")
            : t("owner_wallet_load_failed")}
        </p>
      ) : null}
      {customState !== "ok" || (error && !data) ? null : loading && !data ? (
        <p className="text-sm text-sam-muted">{t("owner_wallet_loading")}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-sam-muted">{t("owner_wallet_empty")}</p>
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
                      ? `${t("owner_wallet_paid_label")} ${formatFinanceAmount({ wallet: "COIN", amount: row.referenceAmount })}`
                      : null;
                  const bal = [paid, `${t("owner_wallet_balance_label")} ${fmtBal(row.balanceAfter)}`].filter(Boolean).join(" · ");
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
