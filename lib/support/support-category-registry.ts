/**
 * Support CATEGORY + ISSUE semantic SSOT (PHASE 3-A).
 * Display strings live in i18n via labelKey — not here.
 *
 * support-context.ts = CONTEXT TRANSPORT ONLY.
 */

export type SupportAudience = "MEMBER" | "OWNER";

export type SupportGuidanceEligibility = "yes" | "partial" | "human_only" | "none";

export type SupportIssueDefinition = {
  id: string;
  labelKey: string;
  guidanceEligible: SupportGuidanceEligibility;
};

export type SupportCategoryDefinition = {
  id: string;
  audiences: readonly SupportAudience[];
  labelKey: string;
  adminLabelKey: string;
  adminGroup: string;
  /** Selectable in product picker (false = legacy alias only). */
  selectable: boolean;
  /** Canonical id when this id is a legacy alias. */
  canonicalId?: string;
  issueTypes: readonly SupportIssueDefinition[];
  /** Must be subset of SUPPORT_REFERENCE_TYPES inventory (validated in tests). */
  allowedReferenceTypes: readonly string[];
  allowedSourceSurfaces: readonly string[] | "*";
  guidanceEligible: SupportGuidanceEligibility;
};

function issues(
  rows: Array<[string, string, SupportGuidanceEligibility?]>
): SupportIssueDefinition[] {
  return rows.map(([id, labelKey, guidanceEligible = "yes"]) => ({
    id,
    labelKey,
    guidanceEligible,
  }));
}

/**
 * Canonical + legacy-alias category registry.
 * Selectable top-level IDs follow PHASE 2 KEEP (no DELIVERY/REFUND/RECHARGE/BANK_ACCOUNT/CAMPAIGN as selectable).
 */
export const SUPPORT_CATEGORY_REGISTRY: readonly SupportCategoryDefinition[] = [
  {
    id: "ACCOUNT",
    audiences: ["MEMBER", "OWNER"],
    labelKey: "support_cat_account",
    adminLabelKey: "support_cat_account",
    adminGroup: "account",
    selectable: true,
    issueTypes: issues([
      ["LOGIN", "support_issue_login", "partial"],
      ["PROFILE", "support_issue_profile", "partial"],
      ["PHONE", "support_issue_phone", "partial"],
      ["DELETE", "support_issue_delete", "human_only"],
      ["OTHER", "support_issue_other", "none"],
    ]),
    allowedReferenceTypes: [],
    allowedSourceSurfaces: "*",
    guidanceEligible: "partial",
  },
  {
    id: "PAYMENT_RECHARGE",
    audiences: ["MEMBER"],
    labelKey: "support_cat_payment_recharge",
    adminLabelKey: "support_cat_payment_recharge",
    adminGroup: "finance",
    selectable: true,
    issueTypes: issues([
      ["POINT_CHARGE_HOW_TO", "support_issue_point_charge_how_to"],
      ["POINT_CHARGE_NOT_REFLECTED", "support_issue_point_charge_not_reflected"],
      ["POINT_CHARGE_STATUS", "support_issue_point_charge_status"],
      ["PAYMENT_FAILED", "support_issue_payment_failed"],
      ["REFUND_GENERAL", "support_issue_refund_general", "human_only"],
      ["OTHER", "support_issue_other", "none"],
    ]),
    allowedReferenceTypes: ["POINT_CHARGE_REQUEST"],
    allowedSourceSurfaces: "*",
    guidanceEligible: "yes",
  },
  {
    id: "ORDER",
    audiences: ["MEMBER"],
    labelKey: "support_cat_order",
    adminLabelKey: "support_cat_order",
    adminGroup: "commerce",
    selectable: true,
    issueTypes: issues([
      ["ORDER_STATUS", "support_issue_order_status"],
      ["DELIVERY_STATUS", "support_issue_delivery_status"],
      ["MISSING_ITEM", "support_issue_missing_item", "human_only"],
      ["CANCEL_CHANGE", "support_issue_cancel_change", "human_only"],
      ["OTHER", "support_issue_other", "none"],
    ]),
    allowedReferenceTypes: ["STORE_ORDER"],
    allowedSourceSurfaces: "*",
    guidanceEligible: "yes",
  },
  {
    id: "DELIVERY",
    audiences: ["MEMBER"],
    labelKey: "support_cat_order",
    adminLabelKey: "support_cat_order",
    adminGroup: "commerce",
    selectable: false,
    canonicalId: "ORDER",
    issueTypes: [],
    allowedReferenceTypes: ["STORE_ORDER"],
    allowedSourceSurfaces: "*",
    guidanceEligible: "yes",
  },
  {
    id: "REFUND",
    audiences: ["MEMBER"],
    labelKey: "support_cat_payment_recharge",
    adminLabelKey: "support_cat_payment_recharge",
    adminGroup: "finance",
    selectable: false,
    canonicalId: "PAYMENT_RECHARGE",
    issueTypes: [],
    allowedReferenceTypes: [],
    allowedSourceSurfaces: "*",
    guidanceEligible: "yes",
  },
  {
    id: "GIFT_CERTIFICATE",
    audiences: ["MEMBER", "OWNER"],
    labelKey: "support_cat_gift_certificate",
    adminLabelKey: "support_cat_gift_certificate",
    adminGroup: "gift",
    selectable: true,
    issueTypes: issues([
      ["PURCHASE", "support_issue_gift_purchase"],
      ["USE", "support_issue_gift_use"],
      ["GIFT_SEND", "support_issue_gift_send"],
      ["VALIDITY", "support_issue_gift_validity"],
      ["OTHER", "support_issue_other", "none"],
    ]),
    allowedReferenceTypes: ["GIFT_INSTANCE"],
    allowedSourceSurfaces: "*",
    guidanceEligible: "yes",
  },
  {
    id: "COUPON",
    audiences: ["MEMBER", "OWNER"],
    labelKey: "support_cat_coupon",
    adminLabelKey: "support_cat_coupon",
    adminGroup: "coupon",
    selectable: true,
    issueTypes: issues([
      ["HOW_TO_USE", "support_issue_coupon_how_to"],
      ["NOT_APPLIED", "support_issue_coupon_not_applied"],
      ["EXPIRED", "support_issue_coupon_expired"],
      ["OTHER", "support_issue_other", "none"],
    ]),
    allowedReferenceTypes: [],
    allowedSourceSurfaces: "*",
    guidanceEligible: "yes",
  },
  {
    id: "REPORT",
    audiences: ["MEMBER"],
    labelKey: "support_cat_report",
    adminLabelKey: "support_cat_report",
    adminGroup: "safety",
    selectable: true,
    issueTypes: issues([
      ["USER", "support_issue_report_user", "human_only"],
      ["POST", "support_issue_report_post", "human_only"],
      ["SAFETY", "support_issue_report_safety", "human_only"],
      ["OTHER", "support_issue_other", "human_only"],
    ]),
    allowedReferenceTypes: [],
    allowedSourceSurfaces: "*",
    guidanceEligible: "human_only",
  },
  {
    id: "AD",
    audiences: ["MEMBER"],
    labelKey: "support_cat_ad",
    adminLabelKey: "support_cat_ad",
    adminGroup: "ads",
    selectable: true,
    issueTypes: issues([
      ["APPLICATION", "support_issue_ad_application"],
      ["REVIEW_STATUS", "support_issue_ad_review"],
      ["PAYMENT", "support_issue_ad_payment"],
      ["EXPOSURE", "support_issue_ad_exposure"],
      ["OTHER", "support_issue_other", "none"],
    ]),
    allowedReferenceTypes: ["FEED_AD_REQUEST"],
    allowedSourceSurfaces: "*",
    guidanceEligible: "yes",
  },
  {
    id: "TECHNICAL",
    audiences: ["MEMBER", "OWNER"],
    labelKey: "support_cat_technical",
    adminLabelKey: "support_cat_technical",
    adminGroup: "technical",
    selectable: true,
    issueTypes: issues([
      ["APP_CRASH", "support_issue_app_crash", "partial"],
      ["PUSH", "support_issue_push", "partial"],
      ["PERFORMANCE", "support_issue_performance", "partial"],
      ["OTHER", "support_issue_other", "none"],
    ]),
    allowedReferenceTypes: [],
    allowedSourceSurfaces: "*",
    guidanceEligible: "partial",
  },
  {
    id: "OTHER",
    audiences: ["MEMBER", "OWNER"],
    labelKey: "support_cat_other",
    adminLabelKey: "support_cat_other",
    adminGroup: "other",
    selectable: true,
    issueTypes: issues([["GENERAL", "support_issue_general", "none"]]),
    allowedReferenceTypes: [],
    allowedSourceSurfaces: "*",
    guidanceEligible: "none",
  },
  {
    id: "STORE",
    audiences: ["OWNER"],
    labelKey: "support_cat_store",
    adminLabelKey: "support_cat_store",
    adminGroup: "store",
    selectable: true,
    issueTypes: issues([
      ["OPS_STATUS", "support_issue_store_ops"],
      ["PROFILE", "support_issue_store_profile"],
      ["OTHER", "support_issue_other", "none"],
    ]),
    allowedReferenceTypes: [],
    allowedSourceSurfaces: "*",
    guidanceEligible: "yes",
  },
  {
    id: "STORE_APPROVAL",
    audiences: ["OWNER"],
    labelKey: "support_cat_store_approval",
    adminLabelKey: "support_cat_store_approval",
    adminGroup: "store",
    selectable: true,
    issueTypes: issues([
      ["APPROVAL", "support_issue_store_approval", "human_only"],
      ["OTHER", "support_issue_other", "none"],
    ]),
    allowedReferenceTypes: [],
    allowedSourceSurfaces: "*",
    guidanceEligible: "yes",
  },
  {
    id: "CASH_COIN",
    audiences: ["OWNER"],
    labelKey: "support_cat_cash_coin",
    adminLabelKey: "support_cat_cash_coin",
    adminGroup: "finance",
    selectable: true,
    issueTypes: issues([
      ["CASH_CHARGE", "support_issue_cash_charge"],
      ["COIN_WITHDRAW", "support_issue_coin_withdraw"],
      ["BALANCE", "support_issue_balance"],
      ["BANK_ACCOUNT", "support_issue_bank_account", "partial"],
      ["OTHER", "support_issue_other", "none"],
    ]),
    allowedReferenceTypes: ["BUSINESS_CASH_CHARGE_REQUEST", "PARTNER_MEMBERSHIP"],
    allowedSourceSurfaces: "*",
    guidanceEligible: "yes",
  },
  {
    id: "RECHARGE",
    audiences: ["OWNER"],
    labelKey: "support_cat_cash_coin",
    adminLabelKey: "support_cat_cash_coin",
    adminGroup: "finance",
    selectable: false,
    canonicalId: "CASH_COIN",
    issueTypes: [],
    allowedReferenceTypes: [],
    allowedSourceSurfaces: "*",
    guidanceEligible: "yes",
  },
  {
    id: "BANK_ACCOUNT",
    audiences: ["OWNER"],
    labelKey: "support_cat_cash_coin",
    adminLabelKey: "support_cat_cash_coin",
    adminGroup: "finance",
    selectable: false,
    canonicalId: "CASH_COIN",
    issueTypes: [],
    allowedReferenceTypes: [],
    allowedSourceSurfaces: "*",
    guidanceEligible: "yes",
  },
  {
    id: "SETTLEMENT",
    audiences: ["OWNER"],
    labelKey: "support_cat_settlement",
    adminLabelKey: "support_cat_settlement",
    adminGroup: "finance",
    selectable: true,
    issueTypes: issues([
      ["STATUS", "support_issue_settlement_status"],
      ["AMOUNT", "support_issue_settlement_amount", "human_only"],
      ["DELAY", "support_issue_settlement_delay", "human_only"],
      ["STATEMENT", "support_issue_settlement_statement"],
      ["OTHER", "support_issue_other", "none"],
    ]),
    allowedReferenceTypes: ["STORE_SETTLEMENT"],
    allowedSourceSurfaces: "*",
    guidanceEligible: "yes",
  },
  {
    id: "DELIVERY_AD",
    audiences: ["OWNER"],
    labelKey: "support_cat_delivery_ad",
    adminLabelKey: "support_cat_delivery_ad",
    adminGroup: "ads",
    selectable: true,
    issueTypes: issues([
      ["APPLICATION", "support_issue_ad_application"],
      ["REVIEW", "support_issue_ad_review"],
      ["PAYMENT", "support_issue_ad_payment"],
      ["EXPOSURE", "support_issue_ad_exposure"],
      ["CREATIVE", "support_issue_ad_creative", "partial"],
      ["OTHER", "support_issue_other", "none"],
    ]),
    allowedReferenceTypes: [
      "AD_CAMPAIGN",
      "DELIVERY_AD_CAMPAIGN",
      "PLATFORM_POPUP_OWNER_REQUEST",
      "PARTNER_MEMBERSHIP",
    ],
    allowedSourceSurfaces: "*",
    guidanceEligible: "yes",
  },
  {
    id: "CAMPAIGN",
    audiences: ["OWNER"],
    labelKey: "support_cat_delivery_ad",
    adminLabelKey: "support_cat_delivery_ad",
    adminGroup: "ads",
    selectable: false,
    canonicalId: "DELIVERY_AD",
    issueTypes: [],
    allowedReferenceTypes: [
      "AD_CAMPAIGN",
      "DELIVERY_AD_CAMPAIGN",
      "PLATFORM_POPUP_OWNER_REQUEST",
      "PARTNER_MEMBERSHIP",
    ],
    allowedSourceSurfaces: "*",
    guidanceEligible: "yes",
  },
  {
    id: "PRODUCT_MENU",
    audiences: ["OWNER"],
    labelKey: "support_cat_product_menu",
    adminLabelKey: "support_cat_product_menu",
    adminGroup: "catalog",
    selectable: true,
    issueTypes: issues([
      ["CREATE_EDIT", "support_issue_product_edit"],
      ["OPTION", "support_issue_product_option"],
      ["VISIBILITY", "support_issue_product_visibility"],
      ["OTHER", "support_issue_other", "none"],
    ]),
    allowedReferenceTypes: ["STORE_PRODUCT"],
    allowedSourceSurfaces: "*",
    guidanceEligible: "yes",
  },
  {
    id: "ORDER_DELIVERY",
    audiences: ["OWNER"],
    labelKey: "support_cat_order_delivery",
    adminLabelKey: "support_cat_order_delivery",
    adminGroup: "commerce",
    selectable: true,
    issueTypes: issues([
      ["ORDER_OPS", "support_issue_order_ops"],
      ["DELIVERY_OPS", "support_issue_delivery_ops"],
      ["CUSTOMER_DISPUTE", "support_issue_customer_dispute", "human_only"],
      ["OTHER", "support_issue_other", "none"],
    ]),
    allowedReferenceTypes: ["STORE_ORDER"],
    allowedSourceSurfaces: "*",
    guidanceEligible: "yes",
  },
] as const;

const byId = new Map(SUPPORT_CATEGORY_REGISTRY.map((c) => [c.id, c]));

/** Selectable product category defs for an audience (no legacy aliases). */
export function listSelectableSupportCategories(
  audience: SupportAudience
): readonly SupportCategoryDefinition[] {
  return SUPPORT_CATEGORY_REGISTRY.filter(
    (c) => c.selectable && c.audiences.includes(audience)
  );
}

/**
 * Transport-accepted category candidate IDs (selectable + legacy aliases).
 * Existing FAB/context callers may still send aliases; open maps to canonical.
 */
export const MEMBER_SUPPORT_CATEGORIES = [
  "ACCOUNT",
  "PAYMENT_RECHARGE",
  "ORDER",
  "DELIVERY",
  "GIFT_CERTIFICATE",
  "COUPON",
  "REFUND",
  "REPORT",
  "AD",
  "TECHNICAL",
  "OTHER",
] as const;

export const OWNER_SUPPORT_CATEGORIES = [
  "STORE",
  "STORE_APPROVAL",
  "CASH_COIN",
  "RECHARGE",
  "BANK_ACCOUNT",
  "SETTLEMENT",
  "DELIVERY_AD",
  "CAMPAIGN",
  "PRODUCT_MENU",
  "COUPON",
  "GIFT_CERTIFICATE",
  "ORDER_DELIVERY",
  "ACCOUNT",
  "TECHNICAL",
  "OTHER",
] as const;

export type MemberSupportCategory = (typeof MEMBER_SUPPORT_CATEGORIES)[number];
export type OwnerSupportCategory = (typeof OWNER_SUPPORT_CATEGORIES)[number];
export type SupportCategory = MemberSupportCategory | OwnerSupportCategory;

const MEMBER_SET = new Set<string>(MEMBER_SUPPORT_CATEGORIES);
const OWNER_SET = new Set<string>(OWNER_SUPPORT_CATEGORIES);

export function getSupportCategoryDefinition(
  categoryId: string
): SupportCategoryDefinition | null {
  return byId.get(categoryId.trim()) ?? null;
}

/**
 * Map legacy/alias category → selectable canonical id.
 * Unknown / empty → null (never invent OTHER).
 */
export function resolveCanonicalSupportCategoryId(
  categoryId: string,
  audience: SupportAudience
): string | null {
  const raw = categoryId.trim();
  if (!raw) return null;
  const def = byId.get(raw);
  if (!def) return null;
  const canonical = def.canonicalId ?? def.id;
  const canonDef = byId.get(canonical);
  if (!canonDef || !canonDef.audiences.includes(audience)) return null;
  if (!canonDef.selectable) return null;
  return canonical;
}

export function listIssueTypesForCategory(
  categoryId: string
): readonly SupportIssueDefinition[] {
  const raw = categoryId.trim();
  const def = byId.get(raw);
  const canonical = def?.canonicalId ?? raw;
  return byId.get(canonical)?.issueTypes ?? [];
}

export function isValidSupportIssueForCategory(
  categoryId: string,
  issueType: string | null | undefined
): boolean {
  if (!issueType?.trim()) return false;
  return listIssueTypesForCategory(categoryId).some((i) => i.id === issueType.trim());
}

export type SupportCategoryValidation =
  | {
      ok: true;
      audience: SupportAudience;
      category: string;
      issueType: string | null;
      /** true when issue omitted via documented compatibility path */
      issueCompatibility: boolean;
    }
  | { ok: false; error: string };

/**
 * Validate category (+ optional issue) for case open.
 *
 * Compatibility (PHASE 3-A):
 * - Existing contextual callers may omit issueType → NULL when `allowMissingIssue`.
 * - Empty category → fail (no OTHER invent).
 * - Explicit OTHER is allowed when client submits OTHER.
 */
export function validateSupportCategoryForOpen(input: {
  audience: SupportAudience;
  category: string;
  issueType?: string | null;
  allowMissingIssue?: boolean;
}): SupportCategoryValidation {
  const audience = input.audience === "OWNER" ? "OWNER" : "MEMBER";
  const rawCategory = typeof input.category === "string" ? input.category.trim() : "";
  if (!rawCategory) {
    return { ok: false, error: "missing_category" };
  }

  const transportOk =
    audience === "OWNER" ? OWNER_SET.has(rawCategory) : MEMBER_SET.has(rawCategory);
  if (!transportOk && !byId.has(rawCategory)) {
    return { ok: false, error: "invalid_category" };
  }

  const canonical = resolveCanonicalSupportCategoryId(rawCategory, audience);
  if (!canonical) {
    return { ok: false, error: "invalid_category" };
  }

  const issueRaw =
    typeof input.issueType === "string" ? input.issueType.trim() : "";
  if (!issueRaw) {
    if (input.allowMissingIssue === true) {
      return {
        ok: true,
        audience,
        category: canonical,
        issueType: null,
        issueCompatibility: true,
      };
    }
    return { ok: false, error: "missing_issue_type" };
  }

  if (!isValidSupportIssueForCategory(canonical, issueRaw)) {
    return { ok: false, error: "invalid_issue_type" };
  }

  return {
    ok: true,
    audience,
    category: canonical,
    issueType: issueRaw,
    issueCompatibility: false,
  };
}
