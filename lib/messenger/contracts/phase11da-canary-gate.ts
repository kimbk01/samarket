/**
 * Phase 11D-A — Bootstrap/Shell + Domain Authority stack (all-user Production Wiring).
 *
 * Production SSOT = PHASE11D_A_* flags (this file).
 * Phase6/7/8/9 `*_PRODUCTION_WIRING` remain false — those are superseded sibling
 * all-user cutovers; keeping them false prevents dual Phase+11D writers.
 * Legacy hub→App Icon dual-write paths are removed in product code (not via LEGACY_DELETE flag alone).
 *
 * Layers ON (all authenticated viewers): bootstrap_read, shell_read, cache_write,
 * realtime_apply, badge_read, read_write, notification_write, production home wiring
 * Domains: general_direct, group, trade, store_order:customer
 * store_order:owner — Owner Surface exposure ON; still excluded from customer Home inbox
 *
 * FORBIDDEN until post-regression Legacy Removal: LEGACY_DELETE file wipe, PERCENT_ROLLOUT.
 * All-user Domain Authority is ON (`PHASE11D_A_ALL_USER_DOMAIN_AUTHORITY`).
 *
 * Identity / Presentation / Bootstrap contracts LOCK — flags only flip product wiring.
 */
import type { ChatDomain } from "@/lib/chat-domain/chat-domain";
import {
  assertPhase11c5CutoverInvariants,
  buildPhase11c5DefaultOffMatrix,
  type Phase11c5LayerState,
} from "@/lib/messenger/contracts/phase11c5-cutover-layer-state";

/** Historical canary QA viewer — retained for evidence / kill diagnostics only */
export const PHASE11D_A_CANARY_ALLOWLIST_USER_IDS = [
  "35dd245c-d398-4ea3-93a0-c0eda37cc777",
] as const;

/**
 * All authenticated viewers get Domain Badge / Home / Atomic / Realtime Authority.
 * Owner surface remains excluded from customer Home inbox.
 */
export const PHASE11D_A_ALL_USER_DOMAIN_AUTHORITY = true as const;

/**
 * STEP2 — Domain Cache Authority (all-user seed/hydrate).
 * Does NOT enable Legacy delete.
 */
export const PHASE11D_A_CACHE_WRITE = true as const;
/** Domain Realtime Authority product apply CONNECTED (all-user) */
export const PHASE11D_A_REALTIME_APPLY = true as const;
/** Domain Badge Authority product read CONNECTED (all-user) */
export const PHASE11D_A_BADGE_READ_WIRING = true as const;
/** Domain Atomic Read Authority product invoke CONNECTED (all-user) */
export const PHASE11D_A_READ_WRITE = true as const;
/** Domain Notification Authority envelope write CONNECTED (native push still forbidden) */
export const PHASE11D_A_NOTIFICATION_WRITE = true as const;
/** Legacy file deletion — remains OFF until post-regression Removal Phase */
export const PHASE11D_A_LEGACY_DELETE = false as const;
export const PHASE11D_A_PERCENT_ROLLOUT = false as const;
/**
 * Domain production home wiring CONNECTED (all-user).
 * Does NOT enable Legacy delete.
 */
export const PHASE11D_A_PRODUCTION_HOME_WIRING = true as const;

/** Authority implementation readiness */
export const PHASE11D_A_REALTIME_AUTHORITY_PREPARED = true as const;
export const PHASE11D_A_BADGE_AUTHORITY_PREPARED = true as const;
export const PHASE11D_A_NOTIFICATION_AUTHORITY_PREPARED = true as const;
export const PHASE11D_A_ATOMIC_READ_AUTHORITY_PREPARED = true as const;
export const PHASE11D_A_OWNER_SURFACE_PREPARED = true as const;
/**
 * Owner Surface exposure CONNECTED for owner product path.
 * Owner remains excluded from customer canary allowlist / cache seed / home inbox.
 */
export const PHASE11D_A_OWNER_SURFACE_EXPOSURE = true as const;

export type Phase11dACanaryDomain =
  | "general_direct"
  | "group"
  | "trade"
  | "store_order_customer";

export const PHASE11D_A_CANARY_DOMAINS: ReadonlyArray<Phase11dACanaryDomain> = [
  "general_direct",
  "group",
  "trade",
  "store_order_customer",
] as const;

/** in-memory kill — 프로세스 즉시 반영 (reload 불필요) */
let canaryKilled = false;
let shellDisplayAllowed = false;
let shadowPassStreak = 0;

export function killPhase11dACanary(reason = "manual"): void {
  canaryKilled = true;
  shellDisplayAllowed = false;
  shadowPassStreak = 0;
  void reason;
}

export function resetPhase11dACanaryKillForTests(): void {
  canaryKilled = false;
  shellDisplayAllowed = false;
  shadowPassStreak = 0;
}

export function isPhase11dACanaryKilled(): boolean {
  return canaryKilled;
}

export function isPhase11dAAllowlisted(viewerUserId: string): boolean {
  const id = viewerUserId.trim();
  if (!id) return false;
  if (PHASE11D_A_ALL_USER_DOMAIN_AUTHORITY) return true;
  return (PHASE11D_A_CANARY_ALLOWLIST_USER_IDS as readonly string[]).includes(id);
}

function isCanarySurface(domain: string, surface: string): boolean {
  return (
    domain === "general_direct" ||
    domain === "group" ||
    domain === "trade" ||
    (domain === "store_order" && surface === "customer")
  );
}

function canaryWriterMode(flagOn: boolean): Phase11c5LayerState["mode"] {
  if (canaryKilled) return "killed";
  return flagOn ? "canary" : "off";
}

export function buildPhase11dALayerMatrix(): Phase11c5LayerState[] {
  const base = buildPhase11c5DefaultOffMatrix();
  return base.map((row) => {
    if (row.domain === "store_order" && row.surface === "owner") {
      return { ...row, mode: "off" };
    }
    if (!isCanarySurface(row.domain, row.surface)) {
      return row;
    }
    if (row.layer === "realtime_apply") {
      return { ...row, mode: canaryWriterMode(PHASE11D_A_REALTIME_APPLY) };
    }
    if (row.layer === "badge_read") {
      return { ...row, mode: canaryWriterMode(PHASE11D_A_BADGE_READ_WIRING) };
    }
    if (row.layer === "read_write") {
      return { ...row, mode: canaryWriterMode(PHASE11D_A_READ_WRITE) };
    }
    if (row.layer === "notification_write") {
      return { ...row, mode: canaryWriterMode(PHASE11D_A_NOTIFICATION_WRITE) };
    }
    if (row.layer === "cache_write") {
      return { ...row, mode: canaryWriterMode(PHASE11D_A_CACHE_WRITE) };
    }
    if (row.layer === "bootstrap_read" || row.layer === "shell_read") {
      return { ...row, mode: canaryKilled ? "killed" : "canary" };
    }
    return row;
  });
}

export function assertPhase11dALayerContract(): void {
  // Domain Authority stack ON for all users. Percent / Legacy delete stay OFF.
  if (!PHASE11D_A_ALL_USER_DOMAIN_AUTHORITY) {
    throw new Error("dibay_phase11da_all_user_domain_authority_must_remain_true");
  }
  if (PHASE11D_A_LEGACY_DELETE) {
    throw new Error("dibay_phase11da_legacy_delete_must_remain_false");
  }
  if (PHASE11D_A_PERCENT_ROLLOUT) {
    throw new Error("dibay_phase11da_percent_rollout_forbidden");
  }
  if (!PHASE11D_A_CACHE_WRITE) {
    throw new Error("dibay_phase11da_cache_write_must_remain_true");
  }
  if (!PHASE11D_A_REALTIME_APPLY || !PHASE11D_A_BADGE_READ_WIRING) {
    throw new Error("dibay_phase11da_realtime_badge_must_remain_connected");
  }
  if (!PHASE11D_A_READ_WRITE || !PHASE11D_A_NOTIFICATION_WRITE) {
    throw new Error("dibay_phase11da_atomic_notification_must_remain_connected");
  }
  if (!PHASE11D_A_PRODUCTION_HOME_WIRING) {
    throw new Error("dibay_phase11da_production_home_wiring_must_remain_connected");
  }
  if (!PHASE11D_A_OWNER_SURFACE_EXPOSURE) {
    throw new Error("dibay_phase11da_owner_surface_exposure_must_remain_connected");
  }
  assertPhase11c5CutoverInvariants({
    states: buildPhase11dALayerMatrix(),
    activeWriters: PHASE11D_A_CACHE_WRITE && !canaryKilled ? ["domain"] : undefined,
    atomicReadRuntimePass: PHASE11D_A_READ_WRITE,
    notificationProductionReady: PHASE11D_A_NOTIFICATION_WRITE,
  });
}

export type Phase11dAAccess =
  | {
      ok: true;
      /**
       * canary — allowlist UI/Read Surface authority path
       * bootstrap_http_live_read — authenticated Domain HTTP readiness (non-allowlist UI stays Legacy)
       */
      mode: "canary" | "bootstrap_http_live_read";
      viewerUserId: string;
    }
  | {
      ok: false;
      reason:
        | "killed"
        | "not_allowlisted"
        | "anonymous"
        | "owner_excluded"
        | "layer_off"
        | "spoof_viewer";
      status: 401 | 403 | 503;
      code: string;
    };

export function resolvePhase11dACanaryAccess(input: {
  authenticatedUserId: string | null;
  /** query/body 로 전달된 viewer — 인증 uid 와 다르면 거부 */
  requestedViewerUserId?: string | null;
  domain?: ChatDomain | "store_order_customer" | "store_order_owner";
  surfaceRole?: "customer" | "owner" | null;
}): Phase11dAAccess {
  assertPhase11dALayerContract();
  if (canaryKilled) {
    return {
      ok: false,
      reason: "killed",
      status: 503,
      code: "dibay_phase11da_canary_killed",
    };
  }
  const uid = input.authenticatedUserId?.trim() ?? "";
  if (!uid) {
    return {
      ok: false,
      reason: "anonymous",
      status: 401,
      code: "unauthorized",
    };
  }
  const spoof = input.requestedViewerUserId?.trim();
  if (spoof && spoof !== uid) {
    return {
      ok: false,
      reason: "spoof_viewer",
      status: 403,
      code: "dibay_phase11da_viewer_spoof_forbidden",
    };
  }
  // Owner surface remains EXCLUDED.
  if (input.surfaceRole === "owner" || input.domain === "store_order_owner") {
    return {
      ok: false,
      reason: "owner_excluded",
      status: 503,
      code: "dibay_phase11da_store_order_owner_excluded",
    };
  }
  // All-user Domain Authority — every authenticated customer viewer uses canary/production path.
  if (isPhase11dAAllowlisted(uid)) {
    return { ok: true, mode: "canary", viewerUserId: uid };
  }
  return { ok: true, mode: "bootstrap_http_live_read", viewerUserId: uid };
}

export function recordPhase11dAShadowPass(pass: boolean): {
  streak: number;
  shellDisplayAllowed: boolean;
} {
  if (canaryKilled) {
    shadowPassStreak = 0;
    shellDisplayAllowed = false;
    return { streak: 0, shellDisplayAllowed: false };
  }
  if (pass) {
    shadowPassStreak += 1;
    if (shadowPassStreak >= 3) shellDisplayAllowed = true;
  } else {
    shadowPassStreak = 0;
    shellDisplayAllowed = false;
  }
  return { streak: shadowPassStreak, shellDisplayAllowed };
}

export function isPhase11dAShellDisplayAllowed(): boolean {
  return !canaryKilled && shellDisplayAllowed;
}

export function getPhase11dAShadowPassStreak(): number {
  return shadowPassStreak;
}

export function phase11dAAccessResponse(access: Extract<Phase11dAAccess, { ok: false }>) {
  return {
    error: access.code,
    code: access.code,
    reason: access.reason,
    cutoverState: "canary_blocked",
  };
}
