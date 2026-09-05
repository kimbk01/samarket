/**
 * ARO-OPS-UX-002-B1R — Domain → Prelaunch Reset contextual entry (no new Reset API).
 */
import type { PrelaunchResetSelectiveScope } from "@/lib/admin/prelaunch-reset/selective-scopes";

export const ADMIN_PRELAUNCH_RESET_PATH = "/admin/prelaunch-reset" as const;

export function buildAdminPrelaunchResetHref(scopes: readonly PrelaunchResetSelectiveScope[]): string {
  const uniq = [...new Set(scopes.filter(Boolean))];
  if (uniq.length === 0) return ADMIN_PRELAUNCH_RESET_PATH;
  const q = new URLSearchParams();
  q.set("scopes", uniq.join(","));
  return `${ADMIN_PRELAUNCH_RESET_PATH}?${q.toString()}`;
}

export const DOMAIN_RESET_SCOPE_PRESETS = {
  trade: ["trade_content"] as const satisfies readonly PrelaunchResetSelectiveScope[],
  community: ["community_posts"] as const satisfies readonly PrelaunchResetSelectiveScope[],
  /** Safe chat subset — Reset still requires explicit chatRoomIds on execute. */
  chat: ["chat"] as const satisfies readonly PrelaunchResetSelectiveScope[],
  delivery: ["delivery_ads"] as const satisfies readonly PrelaunchResetSelectiveScope[],
} as const;
