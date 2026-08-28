/** Admin Gift Operations Center — section / legacy URL SSOT (UI only). */

export const ADMIN_GIFT_OPS_BASE = "/admin/gift-certificates" as const;

/** Final 6-group IA (DESIGN LOCK). */
export const ADMIN_GIFT_OPS_TABS = [
  "dashboard",
  "products",
  "instances",
  "ledger",
  "finance",
  "audit",
] as const;

export type AdminGiftOpsTab = (typeof ADMIN_GIFT_OPS_TABS)[number];

/** @deprecated Legacy 8-tab ids — still accepted via parseAdminGiftOpsTab. */
export const ADMIN_GIFT_OPS_LEGACY_TABS = [
  "summary",
  "redemptions",
  "revenue",
  "money",
  "recovery",
] as const;

export const ADMIN_GIFT_OPS_PRODUCTS_SUBTABS = ["applications", "products"] as const;
export type AdminGiftOpsProductsSubtab = (typeof ADMIN_GIFT_OPS_PRODUCTS_SUBTABS)[number];

export const ADMIN_GIFT_OPS_LEDGER_SUBTABS = ["usage", "settlement"] as const;
export type AdminGiftOpsLedgerSubtab = (typeof ADMIN_GIFT_OPS_LEDGER_SUBTABS)[number];

export const ADMIN_GIFT_OPS_FINANCE_SUBTABS = ["external", "store-cash", "recovery"] as const;
export type AdminGiftOpsFinanceSubtab = (typeof ADMIN_GIFT_OPS_FINANCE_SUBTABS)[number];

/** @deprecated Prefer ADMIN_GIFT_OPS_FINANCE_SUBTABS — money=external|store-cash still accepted. */
export const ADMIN_GIFT_OPS_MONEY_SUBTABS = ["external", "store-cash"] as const;
export type AdminGiftOpsMoneySubtab = (typeof ADMIN_GIFT_OPS_MONEY_SUBTABS)[number];

function normalizeTab(raw: string): AdminGiftOpsTab | null {
  if ((ADMIN_GIFT_OPS_TABS as readonly string[]).includes(raw)) return raw as AdminGiftOpsTab;
  if (raw === "summary") return "dashboard";
  if (raw === "redemptions") return "ledger";
  if (raw === "revenue") return "ledger";
  if (raw === "money" || raw === "recovery") return "finance";
  return null;
}

export function parseAdminGiftOpsTab(raw: string | null | undefined): AdminGiftOpsTab {
  const v = (raw ?? "").trim().toLowerCase();
  return normalizeTab(v) ?? "dashboard";
}

/** Resolve ledger subtab from legacy tab=redemptions|revenue or ledger= query. */
export function parseAdminGiftOpsLedgerSubtab(
  ledgerRaw: string | null | undefined,
  legacyTabRaw?: string | null
): AdminGiftOpsLedgerSubtab {
  const legacy = (legacyTabRaw ?? "").trim().toLowerCase();
  if (legacy === "revenue") return "settlement";
  if (legacy === "redemptions") return "usage";
  const v = (ledgerRaw ?? "").trim().toLowerCase();
  if (v === "settlement" || v === "revenue") return "settlement";
  return "usage";
}

export function parseAdminGiftOpsFinanceSubtab(
  financeRaw: string | null | undefined,
  moneyRaw?: string | null,
  legacyTabRaw?: string | null
): AdminGiftOpsFinanceSubtab {
  const legacy = (legacyTabRaw ?? "").trim().toLowerCase();
  if (legacy === "recovery") return "recovery";
  const fromFinance = (financeRaw ?? "").trim().toLowerCase();
  if ((ADMIN_GIFT_OPS_FINANCE_SUBTABS as readonly string[]).includes(fromFinance)) {
    return fromFinance as AdminGiftOpsFinanceSubtab;
  }
  const fromMoney = (moneyRaw ?? "").trim().toLowerCase();
  if (fromMoney === "store-cash") return "store-cash";
  if (fromMoney === "external") return "external";
  return "external";
}

export function parseAdminGiftOpsProductsSubtab(
  raw: string | null | undefined
): AdminGiftOpsProductsSubtab {
  const v = (raw ?? "").trim().toLowerCase();
  return (ADMIN_GIFT_OPS_PRODUCTS_SUBTABS as readonly string[]).includes(v)
    ? (v as AdminGiftOpsProductsSubtab)
    : "applications";
}

export function parseAdminGiftOpsMoneySubtab(
  raw: string | null | undefined
): AdminGiftOpsMoneySubtab {
  const v = (raw ?? "").trim().toLowerCase();
  return (ADMIN_GIFT_OPS_MONEY_SUBTABS as readonly string[]).includes(v)
    ? (v as AdminGiftOpsMoneySubtab)
    : "external";
}

/** Legacy path segment → canonical query (path after /admin/gift-certificates/). */
export const ADMIN_GIFT_OPS_LEGACY_REDIRECT: Record<
  string,
  {
    tab: AdminGiftOpsTab;
    products?: AdminGiftOpsProductsSubtab;
    money?: AdminGiftOpsMoneySubtab;
    ledger?: AdminGiftOpsLedgerSubtab;
    finance?: AdminGiftOpsFinanceSubtab;
  }
> = {
  applications: { tab: "products", products: "applications" },
  products: { tab: "products", products: "products" },
  tracking: { tab: "instances" },
  revenue: { tab: "ledger", ledger: "settlement" },
  "cash-outs": { tab: "finance", finance: "external", money: "external" },
  conversions: { tab: "finance", finance: "store-cash", money: "store-cash" },
  recovery: { tab: "finance", finance: "recovery" },
};

export function buildAdminGiftOpsHref(args: {
  tab?: AdminGiftOpsTab | (typeof ADMIN_GIFT_OPS_LEGACY_TABS)[number];
  products?: AdminGiftOpsProductsSubtab;
  money?: AdminGiftOpsMoneySubtab;
  ledger?: AdminGiftOpsLedgerSubtab;
  finance?: AdminGiftOpsFinanceSubtab;
  extra?: Record<string, string | null | undefined>;
}): string {
  const qs = new URLSearchParams();
  const rawTab = (args.tab ?? "dashboard") as string;
  const tab = normalizeTab(rawTab) ?? "dashboard";
  qs.set("tab", tab);

  if (tab === "products") {
    qs.set("products", args.products ?? "applications");
  }
  if (tab === "ledger") {
    const ledger =
      args.ledger ??
      (rawTab === "revenue" ? "settlement" : "usage");
    qs.set("ledger", ledger);
  }
  if (tab === "finance") {
    const finance =
      args.finance ??
      (rawTab === "recovery"
        ? "recovery"
        : args.money === "store-cash"
          ? "store-cash"
          : "external");
    qs.set("finance", finance);
    if (finance === "external" || finance === "store-cash") {
      qs.set("money", finance);
    }
  }

  if (args.extra) {
    for (const [k, v] of Object.entries(args.extra)) {
      if (v != null && String(v).trim()) qs.set(k, String(v).trim());
    }
    if (
      tab === "products" &&
      args.extra.id &&
      !args.products &&
      !("products" in args.extra)
    ) {
      qs.delete("products");
    }
  }
  return `${ADMIN_GIFT_OPS_BASE}?${qs.toString()}`;
}

export function legacyGiftPathToOpsHref(
  segment: string,
  searchParams: URLSearchParams
): string {
  const map = ADMIN_GIFT_OPS_LEGACY_REDIRECT[segment];
  if (!map) return ADMIN_GIFT_OPS_BASE;
  const extra: Record<string, string | null | undefined> = {};
  for (const key of ["id", "number", "q", "status", "create", "storeId", "scope", "type", "balance", "focus"]) {
    const v = searchParams.get(key);
    if (v) extra[key] = v;
  }
  return buildAdminGiftOpsHref({
    tab: map.tab,
    products: map.products,
    money: map.money,
    ledger: map.ledger,
    finance: map.finance,
    extra,
  });
}
