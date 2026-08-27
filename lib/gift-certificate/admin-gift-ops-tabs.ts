/** Admin Gift Operations Center — tab / legacy URL SSOT (UI only). */

export const ADMIN_GIFT_OPS_BASE = "/admin/gift-certificates" as const;

export const ADMIN_GIFT_OPS_TABS = [
  "summary",
  "products",
  "instances",
  "redemptions",
  "revenue",
  "money",
  "recovery",
  "audit",
] as const;

export type AdminGiftOpsTab = (typeof ADMIN_GIFT_OPS_TABS)[number];

export const ADMIN_GIFT_OPS_PRODUCTS_SUBTABS = ["applications", "products"] as const;
export type AdminGiftOpsProductsSubtab = (typeof ADMIN_GIFT_OPS_PRODUCTS_SUBTABS)[number];

export const ADMIN_GIFT_OPS_MONEY_SUBTABS = ["external", "store-cash"] as const;
export type AdminGiftOpsMoneySubtab = (typeof ADMIN_GIFT_OPS_MONEY_SUBTABS)[number];

export function parseAdminGiftOpsTab(raw: string | null | undefined): AdminGiftOpsTab {
  const v = (raw ?? "").trim().toLowerCase();
  return (ADMIN_GIFT_OPS_TABS as readonly string[]).includes(v)
    ? (v as AdminGiftOpsTab)
    : "summary";
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
  { tab: AdminGiftOpsTab; products?: AdminGiftOpsProductsSubtab; money?: AdminGiftOpsMoneySubtab }
> = {
  applications: { tab: "products", products: "applications" },
  products: { tab: "products", products: "products" },
  tracking: { tab: "instances" },
  revenue: { tab: "revenue" },
  "cash-outs": { tab: "money", money: "external" },
  conversions: { tab: "money", money: "store-cash" },
  recovery: { tab: "recovery" },
};

export function buildAdminGiftOpsHref(args: {
  tab?: AdminGiftOpsTab;
  products?: AdminGiftOpsProductsSubtab;
  money?: AdminGiftOpsMoneySubtab;
  extra?: Record<string, string | null | undefined>;
}): string {
  const qs = new URLSearchParams();
  const tab = args.tab ?? "summary";
  qs.set("tab", tab);
  if (tab === "products") {
    qs.set("products", args.products ?? "applications");
  }
  if (tab === "money") {
    qs.set("money", args.money ?? "external");
  }
  if (args.extra) {
    for (const [k, v] of Object.entries(args.extra)) {
      if (v != null && String(v).trim()) qs.set(k, String(v).trim());
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
  for (const key of ["id", "number", "q", "status", "create", "storeId"]) {
    const v = searchParams.get(key);
    if (v) extra[key] = v;
  }
  return buildAdminGiftOpsHref({
    tab: map.tab,
    products: map.products,
    money: map.money,
    extra,
  });
}
