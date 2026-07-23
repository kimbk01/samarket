/**
 * Domain Read Surface Canary — QA allowlist only.
 *
 * Connects Home → List → Room Read Surfaces (no writers).
 * Authority is Domain Surface / Domain bundle, never row-mix or field-mix.
 *
 * Bundles:
 * - inbox: home_inbox + general_direct/group rooms
 * - trade: trade_hub + trade_list + trade_room
 * - store_order_customer: so hub + customer list + customer room
 */
import {
  assertPhase11dShellReadUiWritersOff,
  isPhase11dShellReadUiAllowlisted,
  isPhase11dShellReadUiCanaryEnvEnabled,
  isPhase11dShellReadUiCanaryKilled,
  killPhase11dShellReadUiCanary,
  PHASE11D_SHELL_READ_UI_ATOMIC_READ,
  PHASE11D_SHELL_READ_UI_BADGE_WIRING,
  PHASE11D_SHELL_READ_UI_CACHE_WRITE,
  PHASE11D_SHELL_READ_UI_CANARY_VIEWER_IDS,
  PHASE11D_SHELL_READ_UI_LEGACY_DELETE,
  PHASE11D_SHELL_READ_UI_NOTIFICATION,
  PHASE11D_SHELL_READ_UI_REALTIME,
} from "@/lib/messenger/contracts/phase11d-shell-read-ui-canary";

export const DOMAIN_READ_SURFACE_CANARY_VIEWER_IDS = PHASE11D_SHELL_READ_UI_CANARY_VIEWER_IDS;

export type DomainReadBundle = "inbox" | "trade" | "store_order_customer";

export type SurfaceReadAuthority = "legacy" | "domain";

export type DomainReadSurfaceId =
  | "home_inbox"
  | "trade_hub"
  | "trade_list"
  | "trade_room"
  | "store_order_hub"
  | "store_order_customer_list"
  | "store_order_customer_room"
  | "general_room"
  | "group_room";

export const DOMAIN_READ_SURFACE_WRITERS = {
  cache: PHASE11D_SHELL_READ_UI_CACHE_WRITE,
  realtime: PHASE11D_SHELL_READ_UI_REALTIME,
  badge: PHASE11D_SHELL_READ_UI_BADGE_WIRING,
  notification: PHASE11D_SHELL_READ_UI_NOTIFICATION,
  atomic: PHASE11D_SHELL_READ_UI_ATOMIC_READ,
  legacyDelete: PHASE11D_SHELL_READ_UI_LEGACY_DELETE,
} as const;

const bundleKilled = new Map<DomainReadBundle, number>();

/** Production serverless: kill must not poison subsequent device QA forever. */
export const DOMAIN_READ_BUNDLE_KILL_TTL_MS = 45_000 as const;

export function killDomainReadBundle(bundle: DomainReadBundle, reason = "manual"): void {
  bundleKilled.set(bundle, Date.now());
  if (bundle === "inbox") {
    killPhase11dShellReadUiCanary(`inbox_bundle:${reason}`);
  }
  void reason;
}

export function restoreDomainReadBundle(bundle: DomainReadBundle): void {
  bundleKilled.delete(bundle);
}

export function resetDomainReadBundleKillsForTests(): void {
  bundleKilled.clear();
}

export function isDomainReadBundleKilled(bundle: DomainReadBundle, now = Date.now()): boolean {
  if (isPhase11dShellReadUiCanaryKilled()) return true;
  const at = bundleKilled.get(bundle);
  if (at == null) return false;
  if (now - at >= DOMAIN_READ_BUNDLE_KILL_TTL_MS) {
    bundleKilled.delete(bundle);
    return false;
  }
  return true;
}

export function assertDomainReadSurfaceWritersOff(): void {
  // Name kept for call-site stability. Allowlist Domain writers may be CONNECTED;
  // Legacy delete must stay OFF (mirrors assertPhase11dShellReadUiWritersOff).
  assertPhase11dShellReadUiWritersOff();
  if (DOMAIN_READ_SURFACE_WRITERS.legacyDelete) {
    throw new Error("dibay_domain_read_legacy_delete_forbidden");
  }
}

export function isDomainReadSurfaceAllowlisted(viewerUserId: string): boolean {
  return isPhase11dShellReadUiAllowlisted(viewerUserId);
}

export function resolveDomainReadSurfaceAccess(input: {
  authenticatedUserId: string | null;
  bundle: DomainReadBundle;
  env?: NodeJS.ProcessEnv;
}):
  | { ok: true; viewerUserId: string }
  | { ok: false; status: 401 | 403 | 503; code: string; reason: string } {
  assertDomainReadSurfaceWritersOff();
  if (!isPhase11dShellReadUiCanaryEnvEnabled(input.env)) {
    return {
      ok: false,
      status: 503,
      code: "dibay_domain_read_canary_env_off",
      reason: "env_killed",
    };
  }
  if (isDomainReadBundleKilled(input.bundle)) {
    return {
      ok: false,
      status: 503,
      code: "dibay_domain_read_bundle_killed",
      reason: `bundle_killed:${input.bundle}`,
    };
  }
  const uid = input.authenticatedUserId?.trim() ?? "";
  if (!uid) {
    return { ok: false, status: 401, code: "unauthorized", reason: "anonymous" };
  }
  if (!isDomainReadSurfaceAllowlisted(uid)) {
    return {
      ok: false,
      status: 503,
      code: "dibay_domain_read_not_eligible",
      reason: "not_allowlisted",
    };
  }
  return { ok: true, viewerUserId: uid };
}

export function surfaceAuthorityForBundle(
  bundle: DomainReadBundle,
  allowlisted: boolean
): SurfaceReadAuthority {
  if (!allowlisted) return "legacy";
  if (isDomainReadBundleKilled(bundle)) return "legacy";
  return "domain";
}
