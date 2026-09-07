/**
 * Finance UI route SSOT — single entry / single destination per capability.
 * Components MUST use these helpers; do not hand-assemble finance paths.
 */

export type FinanceWalletParam = "POINT" | "COIN" | "CASH";
export type FinanceDirectionParam = "CREDIT" | "DEBIT";

export type FinanceFilterState = {
  wallet?: FinanceWalletParam | null;
  type?: string | null;
  direction?: FinanceDirectionParam | null;
  /** Symbolic: "today" — resolved server-side to Manila business day */
  date?: string | null;
  storeId?: string | null;
  ownerId?: string | null;
  memberId?: string | null;
  orderId?: string | null;
  adId?: string | null;
  txId?: string | null;
  status?: string | null;
  from?: string | null;
  to?: string | null;
  period?: string | null;
  q?: string | null;
};

function appendFilters(qs: URLSearchParams, f?: FinanceFilterState | null) {
  if (!f) return;
  if (f.wallet) qs.set("wallet", f.wallet);
  if (f.type) qs.set("type", f.type);
  if (f.direction) qs.set("direction", f.direction);
  if (f.date) qs.set("date", f.date);
  if (f.storeId) qs.set("storeId", f.storeId);
  if (f.ownerId) qs.set("ownerId", f.ownerId);
  if (f.memberId) qs.set("memberId", f.memberId);
  if (f.orderId) qs.set("orderId", f.orderId);
  if (f.adId) qs.set("adId", f.adId);
  if (f.txId) qs.set("txId", f.txId);
  if (f.status) qs.set("status", f.status);
  if (f.from) qs.set("from", f.from);
  if (f.to) qs.set("to", f.to);
  if (f.period) qs.set("period", f.period);
  if (f.q) qs.set("q", f.q);
}

export function parseFinanceFilters(sp: URLSearchParams): FinanceFilterState {
  const walletRaw = sp.get("wallet")?.trim().toUpperCase() ?? "";
  const wallet =
    walletRaw === "POINT" || walletRaw === "COIN" || walletRaw === "CASH"
      ? (walletRaw as FinanceWalletParam)
      : null;
  const dirRaw = sp.get("direction")?.trim().toUpperCase() ?? "";
  const direction =
    dirRaw === "CREDIT" || dirRaw === "DEBIT" ? (dirRaw as FinanceDirectionParam) : null;
  const dateRaw = sp.get("date")?.trim().toLowerCase() ?? "";
  return {
    wallet,
    type: sp.get("type"),
    direction,
    date: dateRaw === "today" ? "today" : dateRaw || null,
    storeId: sp.get("storeId"),
    ownerId: sp.get("ownerId"),
    memberId: sp.get("memberId"),
    orderId: sp.get("orderId"),
    adId: sp.get("adId"),
    txId: sp.get("txId"),
    status: sp.get("status"),
    from: sp.get("from"),
    to: sp.get("to"),
    period: sp.get("period"),
    q: sp.get("q"),
  };
}

export function financeFiltersToSearchParams(f: FinanceFilterState): string {
  const qs = new URLSearchParams();
  appendFilters(qs, f);
  const s = qs.toString();
  return s ? `?${s}` : "";
}

/** Admin hub */
export function financeHubHref(): string {
  return "/admin/finance";
}

export function financeTransactionListHref(f?: FinanceFilterState | null): string {
  return `/admin/finance/transactions${financeFiltersToSearchParams(f ?? {})}`;
}

export function financeTransactionDetailHref(
  txId: string,
  f?: FinanceFilterState | null
): string {
  const id = txId.trim();
  const qs = new URLSearchParams();
  appendFilters(qs, f);
  const s = qs.toString();
  return `/admin/finance/transactions/${encodeURIComponent(id)}${s ? `?${s}` : ""}`;
}

export function financeStoresHref(f?: FinanceFilterState | null): string {
  return `/admin/finance/stores${financeFiltersToSearchParams(f ?? {})}`;
}

export function financeStoreHref(storeId: string, f?: FinanceFilterState | null): string {
  const qs = new URLSearchParams();
  appendFilters(qs, { ...(f ?? {}), storeId: undefined });
  const s = qs.toString();
  return `/admin/finance/stores/${encodeURIComponent(storeId.trim())}${s ? `?${s}` : ""}`;
}

export function financeOrdersHref(f?: FinanceFilterState | null): string {
  return `/admin/finance/orders${financeFiltersToSearchParams(f ?? {})}`;
}

export function financeOrderHref(orderId: string, f?: FinanceFilterState | null): string {
  const qs = new URLSearchParams();
  appendFilters(qs, f);
  const s = qs.toString();
  return `/admin/finance/orders/${encodeURIComponent(orderId.trim())}${s ? `?${s}` : ""}`;
}

export function financePointHref(f?: FinanceFilterState | null): string {
  return financeTransactionListHref({ ...(f ?? {}), wallet: "POINT" });
}

export function financeCoinHref(f?: FinanceFilterState | null): string {
  return financeTransactionListHref({ ...(f ?? {}), wallet: "COIN" });
}

export function financeCoinEarnedTodayHref(f?: FinanceFilterState | null): string {
  return financeTransactionListHref({
    ...(f ?? {}),
    wallet: "COIN",
    type: "SALE_EARN",
    direction: "CREDIT",
    date: "today",
  });
}

export function financeCashHref(f?: FinanceFilterState | null): string {
  return financeTransactionListHref({ ...(f ?? {}), wallet: "CASH" });
}

export function financeCashInTodayHref(f?: FinanceFilterState | null): string {
  return financeTransactionListHref({
    ...(f ?? {}),
    wallet: "CASH",
    direction: "CREDIT",
    date: "today",
  });
}

export function financeCashOutTodayHref(f?: FinanceFilterState | null): string {
  return financeTransactionListHref({
    ...(f ?? {}),
    wallet: "CASH",
    direction: "DEBIT",
    date: "today",
  });
}

export function financeOutstandingHref(f?: FinanceFilterState | null): string {
  return `/admin/finance/outstanding${financeFiltersToSearchParams(f ?? {})}`;
}

export function financeAdsHref(f?: FinanceFilterState | null): string {
  return `/admin/finance/ads${financeFiltersToSearchParams(f ?? {})}`;
}

export function financeConversionsHref(f?: FinanceFilterState | null): string {
  return `/admin/finance/conversions${financeFiltersToSearchParams(f ?? {})}`;
}

export function financeWithdrawalsHref(f?: FinanceFilterState | null): string {
  return `/admin/finance/withdrawals${financeFiltersToSearchParams(f ?? {})}`;
}

export function financeSettingsHref(): string {
  return "/admin/finance/settings";
}

export function financeDailyHref(storeId: string, f?: FinanceFilterState | null): string {
  return `/admin/finance/stores/${encodeURIComponent(storeId.trim())}/daily${financeFiltersToSearchParams(f ?? {})}`;
}

/** Owner scoped */
export function ownerFinanceHubHref(storeId: string, section?: string | null): string {
  const qs = new URLSearchParams();
  qs.set("storeId", storeId.trim());
  if (section) qs.set("section", section);
  return `/stores/owner/finance?${qs.toString()}`;
}

export function ownerFinanceSectionHref(
  storeId: string,
  section:
    | "transactions"
    | "orders"
    | "outstanding"
    | "coin"
    | "cash"
    | "ads"
    | "convert"
    | "withdraw"
    | "daily",
  f?: FinanceFilterState | null
): string {
  const qs = new URLSearchParams();
  qs.set("storeId", storeId.trim());
  qs.set("section", section);
  appendFilters(qs, { ...(f ?? {}), storeId: undefined });
  return `/stores/owner/finance?${qs.toString()}`;
}

export const ADMIN_FINANCE_NAV = [
  { key: "transactions", href: () => financeTransactionListHref(), labelKo: "전체 거래", labelEn: "All transactions" },
  { key: "stores", href: () => financeStoresHref(), labelKo: "매장별", labelEn: "By store" },
  { key: "orders", href: () => financeOrdersHref(), labelKo: "주문별 정산", labelEn: "Orders" },
  { key: "point", href: () => financePointHref(), labelKo: "Point", labelEn: "Point" },
  { key: "coin", href: () => financeCoinHref(), labelKo: "Coin", labelEn: "Coin" },
  { key: "cash", href: () => financeCashHref(), labelKo: "Cash", labelEn: "Cash" },
  { key: "outstanding", href: () => financeOutstandingHref(), labelKo: "수수료 / 미납", labelEn: "Fees / outstanding" },
  { key: "ads", href: () => financeAdsHref(), labelKo: "광고 지출", labelEn: "Ad spend" },
  { key: "conversions", href: () => financeConversionsHref(), labelKo: "전환", labelEn: "Conversions" },
  { key: "withdrawals", href: () => financeWithdrawalsHref(), labelKo: "출금", labelEn: "Withdrawals" },
  { key: "settings", href: () => financeSettingsHref(), labelKo: "재무 설정", labelEn: "Settings" },
] as const;
