/**
 * STEP 8–9 — Production Wiring CONNECTED (all-user) / Legacy Removal prep only.
 *
 * All-user Domain Authority stack + production home wiring are CONNECTED.
 * Legacy file deletion remains forbidden until post-regression Legacy Removal Phase.
 */
import type { ChatDomain } from "@/lib/chat-domain/chat-domain";
import {
  PHASE1_DEFAULT_CUTOVER,
  assertNoDualWrite,
  type DomainCutoverState,
} from "@/lib/messenger/contracts/cutover";
import {
  PHASE11C5_ATOMIC_READ_RUNTIME_PASS,
  PHASE11C5_LAYER_CUTOVER_PRODUCTION_ON,
  PHASE11C5_NOTIFICATION_PRODUCTION_WIRING_READY,
  buildPhase11c5DefaultOffMatrix,
  type Phase11c5CutoverLayer,
  type Phase11c5LayerState,
} from "@/lib/messenger/contracts/phase11c5-cutover-layer-state";
import {
  PHASE11D_A_ALL_USER_DOMAIN_AUTHORITY,
  PHASE11D_A_ATOMIC_READ_AUTHORITY_PREPARED,
  PHASE11D_A_BADGE_AUTHORITY_PREPARED,
  PHASE11D_A_BADGE_READ_WIRING,
  PHASE11D_A_CACHE_WRITE,
  PHASE11D_A_LEGACY_DELETE,
  PHASE11D_A_NOTIFICATION_AUTHORITY_PREPARED,
  PHASE11D_A_NOTIFICATION_WRITE,
  PHASE11D_A_OWNER_SURFACE_EXPOSURE,
  PHASE11D_A_PERCENT_ROLLOUT,
  PHASE11D_A_PRODUCTION_HOME_WIRING,
  PHASE11D_A_READ_WRITE,
  PHASE11D_A_REALTIME_APPLY,
  PHASE11D_A_REALTIME_AUTHORITY_PREPARED,
  buildPhase11dALayerMatrix,
} from "@/lib/messenger/contracts/phase11da-canary-gate";
import {
  MESSENGER_LEGACY_CATALOG,
  type LegacyCatalogEntry,
  type LegacyPathStatus,
} from "@/lib/messenger/legacy/classification";

/** STEP8 all-user Domain Authority cutover — ON for production wiring. */
export const PHASE11_CUTOVER_ALL_USER_ON_FORBIDDEN = false as const;

/** STEP9 legacy delete — must stay false until Tap E2E + zero Legacy writer evidence. */
export const PHASE11_LEGACY_DELETE_EXECUTE_FORBIDDEN = true as const;

export type DomainAuthorityReadyLayer =
  | "cache"
  | "realtime"
  | "badge"
  | "notification"
  | "atomic_read"
  | "owner_surface"
  | "home_wiring"
  | "legacy_delete";

export type DomainAuthorityReadyRow = Readonly<{
  layer: DomainAuthorityReadyLayer;
  implementationReady: boolean;
  productFlagOn: boolean;
  /** Legacy delete still forbidden; Domain all-user wiring is allowed */
  cutoverAllowedNow: boolean;
  note: string;
}>;

/**
 * Ready matrix — all-user Authority stack CONNECTED; Legacy delete still OFF.
 */
export function buildDomainAuthorityCutoverReadyMatrix(): ReadonlyArray<DomainAuthorityReadyRow> {
  const allUserOn = PHASE11D_A_ALL_USER_DOMAIN_AUTHORITY && !PHASE11_CUTOVER_ALL_USER_ON_FORBIDDEN;
  return [
    {
      layer: "cache",
      implementationReady: true,
      productFlagOn: PHASE11D_A_CACHE_WRITE,
      cutoverAllowedNow: allUserOn,
      note: "All-user Cache Authority CONNECTED",
    },
    {
      layer: "realtime",
      implementationReady: PHASE11D_A_REALTIME_AUTHORITY_PREPARED,
      productFlagOn: PHASE11D_A_REALTIME_APPLY,
      cutoverAllowedNow: allUserOn,
      note: "All-user Realtime Authority CONNECTED; PHASE7 sibling bus OFF",
    },
    {
      layer: "badge",
      implementationReady: PHASE11D_A_BADGE_AUTHORITY_PREPARED,
      productFlagOn: PHASE11D_A_BADGE_READ_WIRING,
      cutoverAllowedNow: allUserOn,
      note: "All-user Badge Authority CONNECTED",
    },
    {
      layer: "notification",
      implementationReady: PHASE11D_A_NOTIFICATION_AUTHORITY_PREPARED,
      productFlagOn: PHASE11D_A_NOTIFICATION_WRITE,
      cutoverAllowedNow: allUserOn,
      note: "All-user Notification envelope CONNECTED; native push forbidden",
    },
    {
      layer: "atomic_read",
      implementationReady: PHASE11D_A_ATOMIC_READ_AUTHORITY_PREPARED,
      productFlagOn: PHASE11D_A_READ_WRITE,
      cutoverAllowedNow: allUserOn,
      note: "All-user Atomic Read Authority CONNECTED",
    },
    {
      layer: "owner_surface",
      implementationReady: true,
      productFlagOn: PHASE11D_A_OWNER_SURFACE_EXPOSURE,
      cutoverAllowedNow: allUserOn,
      note: "Owner Surface exposure CONNECTED; excluded from customer Home inbox",
    },
    {
      layer: "home_wiring",
      implementationReady: true,
      productFlagOn: PHASE11D_A_PRODUCTION_HOME_WIRING,
      cutoverAllowedNow: allUserOn,
      note: "All-user production home wiring CONNECTED; Legacy files retained",
    },
    {
      layer: "legacy_delete",
      implementationReady: false,
      productFlagOn: PHASE11D_A_LEGACY_DELETE,
      cutoverAllowedNow: false,
      note: "STEP9 prep only — catalog listed; files not deleted until Tap PASS + zero Legacy writers",
    },
  ];
}

/** Assert all-user Domain wiring ON; Legacy delete / percent still OFF. */
export function assertDomainCutoverPrepStillOff(): void {
  if (PHASE11C5_LAYER_CUTOVER_PRODUCTION_ON) {
    throw new Error("dibay_phase11c5_production_cutover_on_forbidden");
  }
  if (PHASE11_CUTOVER_ALL_USER_ON_FORBIDDEN) {
    throw new Error("dibay_all_user_domain_cutover_must_be_enabled");
  }
  if (!PHASE11D_A_ALL_USER_DOMAIN_AUTHORITY) {
    throw new Error("dibay_all_user_domain_authority_must_remain_true");
  }
  if (PHASE11D_A_PERCENT_ROLLOUT) {
    throw new Error("dibay_cutover_prep_percent_must_remain_off");
  }
  if (PHASE11D_A_LEGACY_DELETE) {
    throw new Error("dibay_legacy_delete_flag_must_remain_false");
  }
  if (PHASE11_LEGACY_DELETE_EXECUTE_FORBIDDEN !== true) {
    throw new Error("dibay_legacy_delete_execute_must_remain_forbidden");
  }
  if (!PHASE11D_A_PRODUCTION_HOME_WIRING) {
    throw new Error("dibay_production_home_wiring_must_remain_connected");
  }
  if (
    !PHASE11D_A_REALTIME_APPLY ||
    !PHASE11D_A_BADGE_READ_WIRING ||
    !PHASE11D_A_NOTIFICATION_WRITE ||
    !PHASE11D_A_READ_WRITE
  ) {
    throw new Error("dibay_cutover_prep_authority_stack_must_remain_connected");
  }
  assertNoDualWrite(["domain"]);
  void PHASE11C5_ATOMIC_READ_RUNTIME_PASS;
  void PHASE11C5_NOTIFICATION_PRODUCTION_WIRING_READY;
}

/** Phase1 domain cutover states — still all OFF. */
export function listPhase1CutoverStatesStillOff(): ReadonlyArray<DomainCutoverState> {
  return PHASE1_DEFAULT_CUTOVER;
}

/** Current canary matrix snapshot for cutover planning (read-only). */
export function snapshotPhase11dALayerMatrixForCutoverPrep(): ReadonlyArray<Phase11c5LayerState> {
  return buildPhase11dALayerMatrix();
}

export function snapshotPhase11c5DefaultOffMatrixForCutoverPrep(): ReadonlyArray<Phase11c5LayerState> {
  return buildPhase11c5DefaultOffMatrix();
}

export type LegacyRemovalPrepEntry = Readonly<{
  path: string;
  status: LegacyPathStatus;
  note: string;
  deleteNow: false;
}>;

/**
 * STEP9 Legacy Removal manifest categories (prep only — no file deletion).
 * Maps audit-required buckets to catalog coverage notes.
 */
export const LEGACY_REMOVAL_MANIFEST_CATEGORIES = [
  {
    category: "Bootstrap",
    coveredByStatus: ["REPLACE", "DELETE_AFTER_CUTOVER"] as const,
    note: "CM home bootstrap / snapshot assemble REPLACE paths",
  },
  {
    category: "Cache",
    coveredByStatus: ["REPLACE"] as const,
    note: "bootstrap-cache / peek flatMap REPLACE",
  },
  {
    category: "Realtime",
    coveredByStatus: ["REPLACE", "QUARANTINE"] as const,
    note: "room-bump dual-path / shadow dispatch — cutover then delete",
  },
  {
    category: "Badge",
    coveredByStatus: ["REPLACE"] as const,
    note: "legacy hub badge merge paths remain until Domain Badge cutover",
  },
  {
    category: "Notification",
    coveredByStatus: ["QUARANTINE"] as const,
    note: "display context reinference quarantine",
  },
  {
    category: "Read",
    coveredByStatus: ["REPLACE", "DELETE_AFTER_CUTOVER"] as const,
    note: "legacy trade unread merge DELETE_AFTER_CUTOVER",
  },
  {
    category: "route fallback",
    coveredByStatus: ["QUARANTINE", "REPLACE"] as const,
    note: "pathname/contextMeta reinference quarantine",
  },
  {
    category: "BroadcastChannel",
    coveredByStatus: ["REPLACE"] as const,
    note: "multi-tab legacy bus — Domain MultiTab bus replaces at cutover; deleteNow=false",
  },
  {
    category: "session/local storage",
    coveredByStatus: ["REPLACE"] as const,
    note: "legacy bootstrap-cache storage keys — clear only at cutover Phase",
  },
  {
    category: "React state patch",
    coveredByStatus: ["REPLACE", "DELETE_AFTER_CUTOVER"] as const,
    note: "home list state mutation / shadow dual-path — not deleted now",
  },
  {
    category: "API fallback",
    coveredByStatus: ["REPLACE", "QUARANTINE"] as const,
    note: "legacy home-sync / create-or-get bridges",
  },
] as const;

/** STEP9 — list DELETE_AFTER_CUTOVER / REPLACE candidates; do not delete. */
export function listLegacyRemovalPrepCatalog(): ReadonlyArray<LegacyRemovalPrepEntry> {
  return MESSENGER_LEGACY_CATALOG.filter(
    (e: LegacyCatalogEntry) =>
      e.status === "DELETE_AFTER_CUTOVER" || e.status === "REPLACE" || e.status === "QUARANTINE"
  ).map((e) => ({
    path: e.path,
    status: e.status,
    note: e.note,
    deleteNow: false as const,
  }));
}

export function listLegacyRemovalManifestCategories(): typeof LEGACY_REMOVAL_MANIFEST_CATEGORIES {
  return LEGACY_REMOVAL_MANIFEST_CATEGORIES;
}

export function listCutoverLayerOrder(): ReadonlyArray<Phase11c5CutoverLayer> {
  return [
    "bootstrap_read",
    "cache_write",
    "realtime_apply",
    "shell_read",
    "badge_read",
    "read_write",
    "notification_write",
  ];
}

export function listCutoverPrepDomains(): ReadonlyArray<ChatDomain> {
  return ["general_direct", "group", "trade", "store_order"];
}
