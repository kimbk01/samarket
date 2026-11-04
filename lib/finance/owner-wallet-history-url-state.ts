/**
 * 사장님 Coin·Cash·광고 기간 내역 주소 상태 — 기간·칸·쪽 (D-13).
 *
 * - 회원 포인트 화면(`lib/points/points-screen-url-state.ts`)과 같은 방식: 쓰기는 `history.replaceState`(기록 쌓지 않음),
 *   「자세히」로 다른 화면에 갔다 돌아오면 같은 기간·칸·쪽으로 복원.
 * - 한 페이지(재무 화면)에 내역이 여러 개(coin·cash·광고 탭) 있을 수 있어 키에 접두를 붙인다:
 *   `coin_` · `cash_` · `ads_` + `period`(this_month 면 생략) · `from`·`to`(직접 기간, PHT 날짜) · `cat`(칸) · `page`(1부터 · 1이면 생략).
 * 순수 함수만.
 */
import { categoryKinds, type WalletKind } from "@/lib/finance/wallet-period-history";
import { isValidPointsDay } from "@/lib/points/points-screen-url-state";
import {
  OWNER_MONEY_DEFAULT_PERIOD,
  OWNER_MONEY_PERIODS,
  type StoreCommissionPeriod,
} from "@/lib/stores/commission/store-commission-ledger-query";

export type OwnerWalletHistoryUrlState = {
  period: { period: StoreCommissionPeriod; fromDay: string; toDay: string };
  /** 칸 거르기 (null = 전체) — 「광고 지출」 탭은 주소에 쓰지 않는다(항상 ads) */
  category: string | null;
  /** 쪽 (0부터) */
  page: number;
};

/** 내역 하나의 주소 키 접두 — coin·cash·광고 탭이 서로 겹치지 않게 */
export function ownerWalletHistoryUrlPrefix(wallet: WalletKind, adsOnly: boolean): string {
  if (adsOnly) return "ads_";
  return wallet === "coin" ? "coin_" : "cash_";
}

const KEYS = ["period", "from", "to", "cat", "page"] as const;

export function parseOwnerWalletHistoryUrlState(
  sp: Pick<URLSearchParams, "get">,
  opts: { wallet: WalletKind; adsOnly: boolean }
): OwnerWalletHistoryUrlState {
  const p = ownerWalletHistoryUrlPrefix(opts.wallet, opts.adsOnly);
  const raw = String(sp.get(`${p}period`) ?? "").trim();
  const period = (OWNER_MONEY_PERIODS as readonly string[]).includes(raw)
    ? (raw as StoreCommissionPeriod)
    : OWNER_MONEY_DEFAULT_PERIOD;
  const fromDay = String(sp.get(`${p}from`) ?? "").trim();
  const toDay = String(sp.get(`${p}to`) ?? "").trim();
  const cat = String(sp.get(`${p}cat`) ?? "").trim();
  const pageRaw = Math.trunc(Number(sp.get(`${p}page`) ?? ""));
  return {
    period:
      period === "custom"
        ? { period, fromDay: isValidPointsDay(fromDay) ? fromDay : "", toDay: isValidPointsDay(toDay) ? toDay : "" }
        : { period, fromDay: "", toDay: "" },
    category: opts.adsOnly ? "ads" : cat && categoryKinds(opts.wallet, cat) ? cat : null,
    page: Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw - 1 : 0,
  };
}

/** 현재 주소 쿼리(다른 키 보존) + 상태 → 새 쿼리 문자열(`?` 제외). 기본값 키는 지운다. */
export function writeOwnerWalletHistoryUrlState(
  search: string,
  state: OwnerWalletHistoryUrlState,
  opts: { wallet: WalletKind; adsOnly: boolean }
): string {
  const p = ownerWalletHistoryUrlPrefix(opts.wallet, opts.adsOnly);
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  for (const k of KEYS) params.delete(`${p}${k}`);
  if (state.period.period !== OWNER_MONEY_DEFAULT_PERIOD) params.set(`${p}period`, state.period.period);
  if (state.period.period === "custom") {
    if (state.period.fromDay) params.set(`${p}from`, state.period.fromDay);
    if (state.period.toDay) params.set(`${p}to`, state.period.toDay);
  }
  if (!opts.adsOnly && state.category) params.set(`${p}cat`, state.category);
  if (state.page > 0) params.set(`${p}page`, String(state.page + 1));
  return params.toString();
}
