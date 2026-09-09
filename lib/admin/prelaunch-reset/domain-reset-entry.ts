/**
 * ARO-OPS-UX-002-B1R — Domain → Data Reset contextual entry (canonical SSOT).
 */
import { DATA_RESET_CANONICAL_ROUTE } from "@/lib/admin/data-reset/types";
import type { PrelaunchResetSelectiveScope } from "@/lib/admin/prelaunch-reset/selective-scopes";

/** @deprecated use ADMIN_DATA_RESET_PATH — kept for import compatibility */
export const ADMIN_PRELAUNCH_RESET_PATH = DATA_RESET_CANONICAL_ROUTE;
export const ADMIN_DATA_RESET_PATH = DATA_RESET_CANONICAL_ROUTE;

export function buildAdminPrelaunchResetHref(scopes: readonly PrelaunchResetSelectiveScope[]): string {
  const uniq = [...new Set(scopes.filter(Boolean))];
  let domain = "";
  if (uniq.some((s) => s.startsWith("community"))) domain = "community";
  else if (uniq.includes("trade_content")) domain = "market";
  else if (uniq.includes("chat")) domain = "chat";
  else if (uniq.includes("delivery_ads")) domain = "delivery";
  if (!domain) return ADMIN_DATA_RESET_PATH;
  return `${ADMIN_DATA_RESET_PATH}?domain=${domain}`;
}

export const DOMAIN_RESET_SCOPE_PRESETS = {
  trade: ["trade_content"] as const satisfies readonly PrelaunchResetSelectiveScope[],
  community: ["community_posts"] as const satisfies readonly PrelaunchResetSelectiveScope[],
  chat: ["chat"] as const satisfies readonly PrelaunchResetSelectiveScope[],
  delivery: ["delivery_ads"] as const satisfies readonly PrelaunchResetSelectiveScope[],
} as const;
