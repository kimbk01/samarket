/**
 * STEP 3 — Domain Realtime Authority (Phase6 shared CachePort apply).
 *
 * Product flag PHASE11D_A_REALTIME_APPLY CONNECTED (allowlist).
 * Authority path injects Phase6 singletons (no isolated dual Map).
 * Legacy CM UI remains until Legacy Removal; Domain apply patches Phase6 store only.
 *
 * Coexistence: Cache + Realtime + Badge + Notification + Atomic Domain writers OK.
 * Dual writer vs Legacy on the same Domain cache surface remains forbidden.
 */
import type { ChatDomain } from "@/lib/chat-domain/chat-domain";
import { assertNoDualWrite } from "@/lib/messenger/contracts/cutover";
import { PHASE7_DOMAIN_REALTIME_PRODUCTION_WIRING } from "@/lib/messenger/contracts/domain-event-envelope";
import {
  isPhase11dAAllowlisted,
  isPhase11dACanaryKilled,
  PHASE11D_A_REALTIME_APPLY,
} from "@/lib/messenger/contracts/phase11da-canary-gate";
import type {
  DomainRealtimeApplyPort,
  DomainRealtimeApplyResult,
} from "@/lib/messenger/contracts/realtime-apply-port";
import { createGeneralDirectRealtimeApplyPort } from "@/lib/messenger/general-direct/phase7-realtime";
import { generalDirectPhase6Cache } from "@/lib/messenger/general-direct/phase6-bootstrap";
import { createGroupRealtimeApplyPort } from "@/lib/messenger/group/phase7-realtime";
import { groupPhase6Cache } from "@/lib/messenger/group/phase6-bootstrap";
import { createTradeRealtimeApplyPort } from "@/lib/messenger/trade/phase7-realtime";
import { tradePhase6Cache } from "@/lib/messenger/trade/phase6-bootstrap";
import { createStoreOrderRealtimeApplyPort } from "@/lib/messenger/store-order/phase7-realtime";
import { storeOrderPhase6Cache } from "@/lib/messenger/store-order/phase6-bootstrap";
import type { GeneralDirectListItem } from "@/lib/messenger/general-direct/types";
import type { GroupListItem } from "@/lib/messenger/group/types";
import type { TradeListItem } from "@/lib/messenger/trade/types";
import type { StoreOrderListItem } from "@/lib/messenger/store-order/types";

/** Implementation present; product apply remains OFF until cutover. */
export const PHASE11D_A_REALTIME_AUTHORITY_READY = true as const;

export type DomainRealtimeAuthoritySkipResult = Readonly<{
  status: "skipped";
  reason: "authority_off_or_not_allowlisted" | "owner_excluded" | "unknown_domain";
}>;

export type DomainRealtimeAuthorityApplyResult =
  | DomainRealtimeApplyResult
  | DomainRealtimeAuthoritySkipResult;

export function assertDomainRealtimeAuthorityWritersContract(): void {
  if (!PHASE11D_A_REALTIME_APPLY) {
    throw new Error("dibay_domain_realtime_authority_requires_realtime_apply_flag");
  }
  // Sibling Phase7 all-user bus remains OFF; allowlist Authority uses PHASE11D_A_REALTIME_APPLY.
  if (PHASE7_DOMAIN_REALTIME_PRODUCTION_WIRING) {
    throw new Error("dibay_phase7_realtime_all_user_wiring_must_remain_false");
  }
  assertNoDualWrite(["domain"]);
}

/**
 * Product Realtime Authority ON when flag + allowlist + not killed.
 */
export function isDomainRealtimeAuthorityEnabledForViewer(viewerUserId: string): boolean {
  if (!PHASE11D_A_REALTIME_APPLY) return false;
  if (isPhase11dACanaryKilled()) return false;
  if (!isPhase11dAAllowlisted(viewerUserId)) return false;
  return true;
}

export function createDomainRealtimeAuthorityPort(input: {
  domain: ChatDomain;
  viewerUserId: string;
  surfaceRole?: "customer" | "owner" | null;
}):
  | DomainRealtimeApplyPort<GeneralDirectListItem>
  | DomainRealtimeApplyPort<GroupListItem>
  | DomainRealtimeApplyPort<TradeListItem>
  | DomainRealtimeApplyPort<StoreOrderListItem> {
  const viewer = input.viewerUserId.trim();
  if (!viewer) throw new Error("dibay_domain_realtime_authority_viewer_required");
  if (input.domain === "general_direct") {
    return createGeneralDirectRealtimeApplyPort({
      viewerUserId: viewer,
      cache: generalDirectPhase6Cache,
    });
  }
  if (input.domain === "group") {
    return createGroupRealtimeApplyPort({
      viewerUserId: viewer,
      cache: groupPhase6Cache,
    });
  }
  if (input.domain === "trade") {
    return createTradeRealtimeApplyPort({
      viewerUserId: viewer,
      cache: tradePhase6Cache,
    });
  }
  if (input.domain === "store_order") {
    const role = input.surfaceRole ?? "customer";
    if (role === "owner") {
      throw new Error("dibay_domain_realtime_authority_store_order_owner_excluded");
    }
    return createStoreOrderRealtimeApplyPort({
      viewerUserId: viewer,
      surfaceRole: "customer",
      cache: storeOrderPhase6Cache,
    });
  }
  throw new Error("dibay_domain_realtime_authority_unknown_domain");
}

/**
 * Product apply entry — flag OFF → skipped (no Phase6 mutation).
 * When enabled, uses domain_realtime_authority cache write context on Phase6 singleton.
 */
export function applyDomainRealtimeAuthorityEnvelope(input: {
  domain: ChatDomain;
  viewerUserId: string;
  envelope: unknown;
  surfaceRole?: "customer" | "owner" | null;
}): DomainRealtimeAuthorityApplyResult {
  const viewer = input.viewerUserId.trim();
  if (!isDomainRealtimeAuthorityEnabledForViewer(viewer)) {
    return { status: "skipped", reason: "authority_off_or_not_allowlisted" };
  }
  if (input.domain === "store_order" && input.surfaceRole === "owner") {
    return { status: "skipped", reason: "owner_excluded" };
  }
  assertDomainRealtimeAuthorityWritersContract();
  const port = createDomainRealtimeAuthorityPort({
    domain: input.domain,
    viewerUserId: viewer,
    surfaceRole: input.domain === "store_order" ? "customer" : null,
  });
  return port.applyEnvelope(input.envelope, "domain_realtime_authority");
}

export function listDomainRealtimeAuthoritySurfaces(): ReadonlyArray<{
  domain: ChatDomain;
  surface: "default" | "customer";
  authority: "DOMAIN_AUTHORITY" | "OFF";
  ready: typeof PHASE11D_A_REALTIME_AUTHORITY_READY;
}> {
  const authority = PHASE11D_A_REALTIME_APPLY ? ("DOMAIN_AUTHORITY" as const) : ("OFF" as const);
  return [
    { domain: "general_direct", surface: "default", authority, ready: true },
    { domain: "group", surface: "default", authority, ready: true },
    { domain: "trade", surface: "default", authority, ready: true },
    { domain: "store_order", surface: "customer", authority, ready: true },
  ];
}
