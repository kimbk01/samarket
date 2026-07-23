/**
 * Step 2+ — Shell Read UI Canary (single QA allowlist) + Domain Authority writers.
 *
 * Writers mirror PHASE11D_A_* allowlist CONNECTED flags.
 * Legacy delete remains forbidden. Native push remains forbidden.
 */
import {
  PHASE11D_A_ALL_USER_DOMAIN_AUTHORITY,
  PHASE11D_A_BADGE_READ_WIRING,
  PHASE11D_A_CACHE_WRITE,
  PHASE11D_A_LEGACY_DELETE,
  PHASE11D_A_NOTIFICATION_WRITE,
  PHASE11D_A_PRODUCTION_HOME_WIRING,
  PHASE11D_A_READ_WRITE,
  PHASE11D_A_REALTIME_APPLY,
} from "@/lib/messenger/contracts/phase11da-canary-gate";

/** Historical QA UUID — diagnostics only when ALL_USER is off */
export const PHASE11D_SHELL_READ_UI_CANARY_VIEWER_IDS = [
  "35dd245c-d398-4ea3-93a0-c0eda37cc777",
] as const;

/** Master kill — set env DIBAY_SHELL_READ_UI_CANARY=0 to force Legacy for everyone */
export function isPhase11dShellReadUiCanaryEnvEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const v = env.DIBAY_SHELL_READ_UI_CANARY?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "off" || v === "killed") return false;
  // default ON for allowlist path (still gated by allowlist + runtime kill)
  return true;
}

/** Mirror Domain Authority allowlist flags (single SSOT = phase11da-canary-gate). */
export const PHASE11D_SHELL_READ_UI_CACHE_WRITE = PHASE11D_A_CACHE_WRITE;
export const PHASE11D_SHELL_READ_UI_REALTIME = PHASE11D_A_REALTIME_APPLY;
export const PHASE11D_SHELL_READ_UI_BADGE_WIRING = PHASE11D_A_BADGE_READ_WIRING;
export const PHASE11D_SHELL_READ_UI_NOTIFICATION = PHASE11D_A_NOTIFICATION_WRITE;
export const PHASE11D_SHELL_READ_UI_ATOMIC_READ = PHASE11D_A_READ_WRITE;
export const PHASE11D_SHELL_READ_UI_LEGACY_DELETE = PHASE11D_A_LEGACY_DELETE;

let runtimeKilled = false;

export function killPhase11dShellReadUiCanary(reason = "manual"): void {
  runtimeKilled = true;
  void reason;
}

export function resetPhase11dShellReadUiCanaryKillForTests(): void {
  runtimeKilled = false;
}

export function isPhase11dShellReadUiCanaryKilled(): boolean {
  return runtimeKilled;
}

export function isPhase11dShellReadUiAllowlisted(viewerUserId: string): boolean {
  const id = viewerUserId.trim();
  if (!id) return false;
  /** Match client `DOMAIN_SHELL_ALL_USER_HOME_WIRING` — avoid Legacy list while Bottom Chat uses Domain. */
  if (PHASE11D_A_ALL_USER_DOMAIN_AUTHORITY) return true;
  return (PHASE11D_SHELL_READ_UI_CANARY_VIEWER_IDS as readonly string[]).includes(id);
}

export function assertPhase11dShellReadUiWritersOff(): void {
  // Name kept for call-site stability. Legacy delete must stay OFF; Domain writers may be ON.
  if (PHASE11D_SHELL_READ_UI_LEGACY_DELETE) throw new Error("dibay_step2_legacy_delete_forbidden");
}

export type Phase11dShellHomeDto = Readonly<{
  authority: "domain_shell_read_ui_canary";
  viewerUserId: string;
  producedAt: string;
  inbox: ReadonlyArray<{
    domain: "general_direct" | "group";
    roomId: string;
    domainIdentityKey: string;
    title: string;
    avatarUrl: string | null;
    previewText: string;
    lastMessageAt: string;
    unreadCount: number;
    href: string;
    groupId?: string;
    memberCount?: number;
  }>;
  tradeHub: {
    domain: "trade";
    roomCount: number;
    unreadRoomCount: number;
    latestRoomId: string | null;
    latestActivityAt: string | null;
    previewText: string;
    href: string;
  };
  storeOrderHub: {
    domain: "store_order";
    roomCount: number;
    unreadRoomCount: number;
    latestRoomId: string | null;
    latestActivityAt: string | null;
    previewText: string;
    href: string;
    /** customer surface only — member identity must stay false */
    exposesMemberIdentity: false;
  };
  counts: {
    generalDirect: number;
    group: number;
  };
  writers: {
    /** Domain Cache Authority (allowlist) */
    cache: boolean;
    realtime: boolean;
    badge: boolean;
    notification: boolean;
    atomic: boolean;
  };
  /**
   * Domain Badge Authority shell (allowlist). Messenger = G+G; Trade; Store Order.
   * Null when badge wiring skipped.
   */
  badge: {
    messenger: number;
    trade: number;
    storeOrder: number;
    authority: "domain_badge" | "off";
  } | null;
}>;

export type Phase11dShellGuardFail = Readonly<{
  ok: false;
  trigger: string;
  code: "dibay_shell_read_ui_rollback";
}>;

export type Phase11dShellGuardPass = Readonly<{ ok: true }>;

/**
 * Surface-wide rollback triggers (any fail → Legacy whole surface).
 */
export function validatePhase11dShellHomeDto(
  dto: Phase11dShellHomeDto,
  prev: Phase11dShellHomeDto | null
): Phase11dShellGuardPass | Phase11dShellGuardFail {
  if (dto.authority !== "domain_shell_read_ui_canary") {
    return { ok: false, trigger: "invalid_authority", code: "dibay_shell_read_ui_rollback" };
  }
  for (const row of dto.inbox) {
    if (row.domain !== "general_direct" && row.domain !== "group") {
      return { ok: false, trigger: "inbox_domain_contamination", code: "dibay_shell_read_ui_rollback" };
    }
    if (row.domain === "general_direct" && !row.roomId) {
      return { ok: false, trigger: "general_row_invalid", code: "dibay_shell_read_ui_rollback" };
    }
  }
  if (dto.tradeHub.domain !== "trade") {
    return { ok: false, trigger: "trade_hub_domain", code: "dibay_shell_read_ui_rollback" };
  }
  if (dto.storeOrderHub.domain !== "store_order") {
    return { ok: false, trigger: "store_order_hub_domain", code: "dibay_shell_read_ui_rollback" };
  }
  if (dto.storeOrderHub.exposesMemberIdentity !== false) {
    return { ok: false, trigger: "store_order_member_identity", code: "dibay_shell_read_ui_rollback" };
  }
  if (
    dto.writers.cache !== Boolean(PHASE11D_SHELL_READ_UI_CACHE_WRITE) ||
    dto.writers.realtime !== Boolean(PHASE11D_SHELL_READ_UI_REALTIME) ||
    dto.writers.badge !== Boolean(PHASE11D_SHELL_READ_UI_BADGE_WIRING) ||
    dto.writers.notification !== Boolean(PHASE11D_SHELL_READ_UI_NOTIFICATION) ||
    dto.writers.atomic !== Boolean(PHASE11D_SHELL_READ_UI_ATOMIC_READ)
  ) {
    return { ok: false, trigger: "writer_layer_mismatch", code: "dibay_shell_read_ui_rollback" };
  }
  if (dto.counts.generalDirect !== dto.inbox.filter((r) => r.domain === "general_direct").length) {
    return { ok: false, trigger: "general_count_mismatch", code: "dibay_shell_read_ui_rollback" };
  }
  if (dto.counts.group !== dto.inbox.filter((r) => r.domain === "group").length) {
    return { ok: false, trigger: "group_count_mismatch", code: "dibay_shell_read_ui_rollback" };
  }
  // Hub latest must be consistent with roomCount semantics (empty ↔ null)
  if (dto.tradeHub.roomCount === 0 && dto.tradeHub.latestRoomId != null) {
    return { ok: false, trigger: "trade_hub_latest_mismatch", code: "dibay_shell_read_ui_rollback" };
  }
  if (dto.storeOrderHub.roomCount === 0 && dto.storeOrderHub.latestRoomId != null) {
    return { ok: false, trigger: "store_order_hub_latest_mismatch", code: "dibay_shell_read_ui_rollback" };
  }
  if (prev) {
    if (prev.counts.generalDirect > 0 && dto.counts.generalDirect === 0) {
      return { ok: false, trigger: "general_rows_disappeared", code: "dibay_shell_read_ui_rollback" };
    }
    if (prev.counts.group > 0 && dto.counts.group === 0) {
      return { ok: false, trigger: "group_rows_disappeared", code: "dibay_shell_read_ui_rollback" };
    }
  }
  return { ok: true };
}

export function resolvePhase11dShellReadUiAccess(input: {
  authenticatedUserId: string | null;
  env?: NodeJS.ProcessEnv;
}):
  | { ok: true; viewerUserId: string }
  | { ok: false; status: 401 | 403 | 503; code: string; reason: string } {
  assertPhase11dShellReadUiWritersOff();
  if (!isPhase11dShellReadUiCanaryEnvEnabled(input.env)) {
    return {
      ok: false,
      status: 503,
      code: "dibay_shell_read_ui_canary_env_off",
      reason: "env_killed",
    };
  }
  if (runtimeKilled) {
    return {
      ok: false,
      status: 503,
      code: "dibay_shell_read_ui_canary_killed",
      reason: "runtime_killed",
    };
  }
  const uid = input.authenticatedUserId?.trim() ?? "";
  if (!uid) {
    return { ok: false, status: 401, code: "unauthorized", reason: "anonymous" };
  }
  if (!isPhase11dShellReadUiAllowlisted(uid)) {
    return {
      ok: false,
      status: 503,
      code: "dibay_shell_read_ui_not_eligible",
      reason: "not_allowlisted",
    };
  }
  // Production Home Wiring CONNECTED — Domain Shell Home is the allowlist product surface.
  if (!PHASE11D_A_PRODUCTION_HOME_WIRING) {
    return {
      ok: false,
      status: 503,
      code: "dibay_shell_read_ui_home_wiring_off",
      reason: "production_home_wiring_off",
    };
  }
  return { ok: true, viewerUserId: uid };
}
