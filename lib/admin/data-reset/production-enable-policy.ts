/**
 * DIBAY Data Reset — Production execute enable policy (per-scope allowlist).
 *
 * CUT H Pre-launch Reset production ban stays unchanged.
 * This file is the sole Production execute allowlist owner for `/admin/system/data-reset`.
 *
 * Runtime destructive delete on Production is NOT proven by this policy alone —
 * requires DATA_RESET_PRODUCTION_EXECUTE=1 + allowlisted scope + plan gates.
 */

import type {
  DataResetDomain,
  DataResetScope,
  DataResetPlan,
  DataResetTableAction,
} from "@/lib/admin/data-reset/types";

export type DataResetProductionEnableDecision =
  | "ENABLE"
  | "BLOCKED"
  | "EXCLUDED";

export type DataResetProductionScopeKey =
  | "community:single"
  | "community:all"
  | "market:single"
  | "market:all"
  | "delivery:product"
  | "delivery:store_operating"
  | "delivery:all_operating"
  | "chat:room"
  | "chat:type"
  | "chat:all"
  | "friend:user"
  | "friend:all"
  | "member:app_data"
  | "member:auth_delete"
  | "full:operational"
  | "finance:all"
  | "auth_purge"
  | "truncate";

export type DataResetProductionMatrixRow = {
  key: DataResetProductionScopeKey;
  domain: DataResetDomain | "auth_purge" | "truncate";
  scope: DataResetScope | "n/a";
  subtype: string | null;
  codeReady: boolean;
  schemaReady: boolean;
  storageReady: boolean;
  derivedReady: boolean;
  auditReady: boolean;
  confirmationReady: boolean;
  rollbackExpectation: string;
  productionEnable: DataResetProductionEnableDecision;
  notes: string;
};

/** Inventory + enable decisions — closed contracts only, no new delete semantics. */
export const DATA_RESET_PRODUCTION_ENABLE_MATRIX: readonly DataResetProductionMatrixRow[] = [
  {
    key: "community:single",
    domain: "community",
    scope: "single",
    subtype: null,
    codeReady: true,
    schemaReady: true,
    storageReady: true,
    derivedReady: true,
    auditReady: true,
    confirmationReady: true,
    rollbackExpectation: "restore from backup / re-seed content only",
    productionEnable: "ENABLE",
    notes: "DB-linked post-images + derived community_feed",
  },
  {
    key: "community:all",
    domain: "community",
    scope: "all",
    subtype: null,
    codeReady: true,
    schemaReady: true,
    storageReady: true,
    derivedReady: true,
    auditReady: true,
    confirmationReady: true,
    rollbackExpectation: "backup restore",
    productionEnable: "ENABLE",
    notes: "cross-domain preserve (market/chat/finance)",
  },
  {
    key: "market:single",
    domain: "market",
    scope: "single",
    subtype: null,
    codeReady: true,
    schemaReady: true,
    storageReady: true,
    derivedReady: true,
    auditReady: true,
    confirmationReady: true,
    rollbackExpectation: "re-list",
    productionEnable: "ENABLE",
    notes: "listing delete + trade DETACH; images DB-linked",
  },
  {
    key: "market:all",
    domain: "market",
    scope: "all",
    subtype: null,
    codeReady: true,
    schemaReady: true,
    storageReady: true,
    derivedReady: true,
    auditReady: true,
    confirmationReady: true,
    rollbackExpectation: "backup restore",
    productionEnable: "ENABLE",
    notes: "same preserve as single",
  },
  {
    key: "delivery:product",
    domain: "delivery",
    scope: "single",
    subtype: "product",
    codeReady: true,
    schemaReady: true,
    storageReady: true,
    derivedReady: true,
    auditReady: true,
    confirmationReady: true,
    rollbackExpectation: "re-create product",
    productionEnable: "ENABLE",
    notes: "store_orders/finance/gift PRESERVE",
  },
  {
    key: "delivery:store_operating",
    domain: "delivery",
    scope: "single",
    subtype: "store",
    codeReady: true,
    schemaReady: true,
    storageReady: true,
    derivedReady: true,
    auditReady: true,
    confirmationReady: true,
    rollbackExpectation: "re-upload products",
    productionEnable: "ENABLE",
    notes: "stores row NOT deleted",
  },
  {
    key: "delivery:all_operating",
    domain: "delivery",
    scope: "all",
    subtype: "operating",
    codeReady: true,
    schemaReady: true,
    storageReady: true,
    derivedReady: true,
    auditReady: true,
    confirmationReady: true,
    rollbackExpectation: "backup restore",
    productionEnable: "ENABLE",
    notes: "all store_products; stores identity preserved",
  },
  {
    key: "chat:room",
    domain: "chat",
    scope: "single",
    subtype: null,
    codeReady: true,
    schemaReady: true,
    storageReady: true,
    derivedReady: true,
    auditReady: true,
    confirmationReady: true,
    rollbackExpectation: "soft tombstone; detach irreversible link-only",
    productionEnable: "ENABLE",
    notes: "B4 soft/detach only — no hard message wipe",
  },
  {
    key: "chat:type",
    domain: "chat",
    scope: "type",
    subtype: null,
    codeReady: true,
    schemaReady: true,
    storageReady: true,
    derivedReady: true,
    auditReady: true,
    confirmationReady: true,
    rollbackExpectation: "soft/detach by chat_domain",
    productionEnable: "BLOCKED",
    notes: "L2 (MEDIUM/type) — SERVER_REAUTH_NOT_IMPLEMENTED; Production execute fail-closed",
  },
  {
    key: "chat:all",
    domain: "chat",
    scope: "all",
    subtype: null,
    codeReady: true,
    schemaReady: true,
    storageReady: true,
    derivedReady: true,
    auditReady: true,
    confirmationReady: true,
    rollbackExpectation: "backup restore",
    productionEnable: "ENABLE",
    notes: "soft+detach composition",
  },
  {
    key: "friend:user",
    domain: "friend",
    scope: "user",
    subtype: null,
    codeReady: true,
    schemaReady: true,
    storageReady: true,
    derivedReady: true,
    auditReady: true,
    confirmationReady: true,
    rollbackExpectation: "re-friend",
    productionEnable: "BLOCKED",
    notes: "L2 (MEDIUM/user) — SERVER_REAUTH_NOT_IMPLEMENTED; Production execute fail-closed",
  },
  {
    key: "friend:all",
    domain: "friend",
    scope: "all",
    subtype: null,
    codeReady: true,
    schemaReady: true,
    storageReady: true,
    derivedReady: true,
    auditReady: true,
    confirmationReady: true,
    rollbackExpectation: "backup restore",
    productionEnable: "ENABLE",
    notes: "user_social_relations only",
  },
  {
    key: "member:app_data",
    domain: "member",
    scope: "user",
    subtype: "app_data",
    codeReady: true,
    schemaReady: true,
    storageReady: true,
    derivedReady: true,
    auditReady: true,
    confirmationReady: true,
    rollbackExpectation: "user content restore",
    productionEnable: "ENABLE",
    notes: "community_posts+posts+friends only; auth/finance/orders/chat rooms preserved",
  },
  {
    key: "member:auth_delete",
    domain: "member",
    scope: "user",
    subtype: "auth_delete",
    codeReady: true,
    schemaReady: true,
    storageReady: true,
    derivedReady: true,
    auditReady: true,
    confirmationReady: true,
    rollbackExpectation: "n/a — blocked",
    productionEnable: "BLOCKED",
    notes: "AUTH_ACCOUNT_DELETE_BLOCKED — Member auth purge LOCKED",
  },
  {
    key: "full:operational",
    domain: "full",
    scope: "all",
    subtype: null,
    codeReady: true,
    schemaReady: true,
    storageReady: true,
    derivedReady: true,
    auditReady: true,
    confirmationReady: true,
    rollbackExpectation: "full backup restore",
    productionEnable: "ENABLE",
    notes: "community+market+delivery operating+chat+friend only; finance/auth/TRUNCATE excluded",
  },
  {
    key: "finance:all",
    domain: "finance",
    scope: "all",
    subtype: null,
    codeReady: true,
    schemaReady: true,
    storageReady: true,
    derivedReady: true,
    auditReady: true,
    confirmationReady: true,
    rollbackExpectation: "n/a — blocked",
    productionEnable: "BLOCKED",
    notes: "FINANCE HARD RESET LOCKED",
  },
  {
    key: "auth_purge",
    domain: "auth_purge",
    scope: "n/a",
    subtype: null,
    codeReady: false,
    schemaReady: false,
    storageReady: false,
    derivedReady: false,
    auditReady: true,
    confirmationReady: true,
    rollbackExpectation: "n/a",
    productionEnable: "EXCLUDED",
    notes: "never part of Data Reset Full",
  },
  {
    key: "truncate",
    domain: "truncate",
    scope: "n/a",
    subtype: null,
    codeReady: false,
    schemaReady: false,
    storageReady: false,
    derivedReady: false,
    auditReady: true,
    confirmationReady: true,
    rollbackExpectation: "n/a",
    productionEnable: "EXCLUDED",
    notes: "wipe-all SQL NOT WIRED",
  },
] as const;

const FINANCE_TABLE_MARKERS = [
  "point_ledger",
  "business_cash_ledger",
  "store_economic_point_ledger",
  "store_cash_ledger",
  "gift_certificate",
  "store_settlements",
  "store_payments",
  "sale_fee_obligations",
  "store_orders",
] as const;

const FORBIDDEN_DELETE_TABLES = [
  "audit_logs",
  "admin_memberships",
  "auth.users",
  "profiles",
] as const;

export function resolveDataResetProductionScopeKey(input: {
  domain: DataResetDomain;
  scope: DataResetScope;
  subtype?: string | null;
}): DataResetProductionScopeKey | null {
  const subtype = String(input.subtype ?? "").trim();
  switch (input.domain) {
    case "community":
      if (input.scope === "single") return "community:single";
      if (input.scope === "all") return "community:all";
      return null;
    case "market":
      if (input.scope === "single") return "market:single";
      if (input.scope === "all") return "market:all";
      return null;
    case "delivery":
      if (input.scope === "single" && subtype === "product") return "delivery:product";
      if (input.scope === "single" && subtype === "store") return "delivery:store_operating";
      if (input.scope === "all" || subtype === "operating") return "delivery:all_operating";
      return null;
    case "chat":
      if (input.scope === "single") return "chat:room";
      if (input.scope === "type") return "chat:type";
      if (input.scope === "all") return "chat:all";
      return null;
    case "friend":
      if (input.scope === "user") return "friend:user";
      if (input.scope === "all") return "friend:all";
      return null;
    case "member":
      if (subtype === "auth_delete" || subtype === "full_user") return "member:auth_delete";
      if (input.scope === "user" || input.scope === "single") return "member:app_data";
      return null;
    case "full":
      return "full:operational";
    case "finance":
      return "finance:all";
    default:
      return null;
  }
}

export function isDataResetProductionScopeEnabled(input: {
  domain: DataResetDomain;
  scope: DataResetScope;
  subtype?: string | null;
}): boolean {
  const key = resolveDataResetProductionScopeKey(input);
  if (!key) return false;
  const row = DATA_RESET_PRODUCTION_ENABLE_MATRIX.find((r) => r.key === key);
  return row?.productionEnable === "ENABLE";
}

export type FullResetSafetyInspection = {
  ok: boolean;
  containsFinanceDelete: boolean;
  containsAuthDelete: boolean;
  containsTruncate: boolean;
  containsRootAdminDelete: boolean;
  containsAuditDelete: boolean;
  violations: string[];
};

function actionLooksDestructive(a: DataResetTableAction): boolean {
  return a.action === "DELETE" || a.action === "RESET_STATE";
}

export function inspectFullResetSafety(plan: Pick<
  DataResetPlan,
  "domain" | "delete" | "softDelete" | "detach" | "resetState" | "blocked" | "preserve"
>): FullResetSafetyInspection {
  const violations: string[] = [];
  const destructive = [...plan.delete, ...plan.resetState].filter(actionLooksDestructive);

  const containsFinanceDelete = destructive.some((a) =>
    FINANCE_TABLE_MARKERS.some((m) => a.table.includes(m))
  );
  const containsAuthDelete = destructive.some(
    (a) => a.table === "auth.users" || a.filterDescription.includes("auth.users")
  );
  const containsTruncate = destructive.some((a) => {
    const desc = a.filterDescription.toLowerCase();
    return desc.includes("truncate") || desc.includes("wipe-all");
  });
  const containsRootAdminDelete = destructive.some((a) => a.table === "admin_memberships");
  const containsAuditDelete = destructive.some((a) => a.table === "audit_logs");
  const containsForbiddenPreserveTableDelete = destructive.some((a) =>
    (FORBIDDEN_DELETE_TABLES as readonly string[]).includes(a.table)
  );

  if (containsFinanceDelete) violations.push("containsFinanceDelete");
  if (containsAuthDelete) violations.push("containsAuthDelete");
  if (containsTruncate || containsForbiddenPreserveTableDelete) {
    violations.push("containsTruncateOrForbiddenTable");
  }
  if (containsRootAdminDelete) violations.push("containsRootAdminDelete");
  if (containsAuditDelete) violations.push("containsAuditDelete");

  if (plan.domain === "full") {
    if (!plan.blocked.includes("finance_hard_reset")) violations.push("full_missing_finance_block");
    if (!plan.blocked.includes("auth_users_wipe")) violations.push("full_missing_auth_block");
    if (!plan.blocked.includes("wipe_all_app_data_sql")) violations.push("full_missing_wipe_block");
  }

  return {
    ok: violations.length === 0,
    containsFinanceDelete,
    containsAuthDelete,
    containsTruncate: containsTruncate || containsForbiddenPreserveTableDelete,
    containsRootAdminDelete,
    containsAuditDelete,
    violations,
  };
}

/** Server fail-closed for finance / auth purge requests. */
export function assertDataResetFailClosedDomain(input: {
  domain: DataResetDomain;
  subtype?: string | null;
}): { ok: true } | { ok: false; reason: string } {
  if (input.domain === "finance") {
    return { ok: false, reason: "FINANCIAL_HARD_RESET_BLOCKED" };
  }
  const subtype = String(input.subtype ?? "").trim();
  if (input.domain === "member" && (subtype === "auth_delete" || subtype === "full_user")) {
    return { ok: false, reason: "AUTH_ACCOUNT_DELETE_BLOCKED" };
  }
  return { ok: true };
}
