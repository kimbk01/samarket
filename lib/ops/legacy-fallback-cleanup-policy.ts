/**
 * LFC1 — legacy fallback cleanup policy (soft-disable + delete gate; no hard delete without OPS1-B).
 */
export type LegacyFallbackTrackId =
  | "HUB_BADGE"
  | "HS2"
  | "RB1"
  | "SM1"
  | "ODN1"
  | "DSA1"
  | "OOL1"
  | "CR1"
  | "SOD1"
  | "SOL1"
  | "SB1"
  | "CMB1"
  | "FBT1";

export type LegacyFallbackRouteSpec = {
  track: LegacyFallbackTrackId;
  route: string;
  fallback_branch: string;
  legacy_module?: string;
  legacy_builder?: string;
  rpc_name: string;
  snapshot_table?: string;
  verify_rpc_script: string;
  verify_e2e_script: string;
  reconnect_related: 0 | 1;
  /** Structural PASS recorded — fallback branch still present until LFC1 delete gate. */
  structural_pass: 1;
  /** LFC1-A hard delete completed — legacy branch removed from code. */
  hard_deleted?: 1;
};

/** Snapshot-first PASS tracks — legacy branch audit registry (LFC1 step 1). */
export const LEGACY_FALLBACK_ROUTE_REGISTRY: readonly LegacyFallbackRouteSpec[] = [
  {
    track: "HUB_BADGE",
    route: "/api/me/store-owner-hub-badge",
    fallback_branch: "legacy_aggregate",
    legacy_module: "lib/chats/build-owner-hub-badge-payload.ts",
    rpc_name: "get_owner_hub_badge_snapshot",
    snapshot_table: "owner_hub_badge_snapshots",
    verify_rpc_script: "verify:hub-badge-snapshot-rpc",
    verify_e2e_script: "verify:hub-badge-snapshot-e2e",
    reconnect_related: 1,
    structural_pass: 1,
  },
  {
    track: "HS2",
    route: "/api/community-messenger/home-sync",
    fallback_branch: "legacy_multi_wave",
    legacy_module: "lib/community-messenger/service.ts",
    rpc_name: "get_community_messenger_home_sync_snapshot",
    snapshot_table: "community_messenger_home_sync_snapshots",
    verify_rpc_script: "verify:home-sync-snapshot-rpc",
    verify_e2e_script: "verify:home-sync-snapshot-e2e",
    reconnect_related: 1,
    structural_pass: 1,
  },
  {
    track: "RB1",
    route: "/api/community-messenger/rooms/[roomId]/bootstrap",
    fallback_branch: "legacy_wave_a_multi_query",
    legacy_module: "lib/community-messenger/service.ts",
    rpc_name: "get_community_messenger_room_bootstrap_snapshot",
    snapshot_table: "community_messenger_room_bootstrap_snapshots",
    verify_rpc_script: "verify:room-bootstrap-snapshot-rpc",
    verify_e2e_script: "verify:room-bootstrap-snapshot-e2e",
    reconnect_related: 1,
    structural_pass: 1,
  },
  {
    track: "SM1",
    route: "/api/stores/[slug]/menus",
    fallback_branch: "legacy_products_popular_meta",
    legacy_module: "lib/stores/fetch-store-menus-catalog.ts",
    rpc_name: "get_store_menus_snapshot",
    snapshot_table: "store_menus_snapshots",
    verify_rpc_script: "verify:store-menus-snapshot-rpc",
    verify_e2e_script: "verify:store-menus-snapshot-e2e",
    reconnect_related: 0,
    structural_pass: 1,
    hard_deleted: 1,
  },
  {
    track: "ODN1",
    route: "/api/me/notifications",
    fallback_branch: "legacy_segmented_unread",
    legacy_module: "app/api/me/notifications/route.ts",
    rpc_name: "get_owner_dashboard_notifications_snapshot",
    snapshot_table: "owner_dashboard_notifications_snapshots",
    verify_rpc_script: "verify:owner-dashboard-notifications-snapshot-rpc",
    verify_e2e_script: "verify:owner-dashboard-notifications-snapshot-e2e",
    reconnect_related: 0,
    structural_pass: 1,
    hard_deleted: 1,
  },
  {
    track: "DSA1",
    route: "/api/me/stores/[storeId]/order-counts",
    fallback_branch: "legacy_25_count",
    legacy_module: "lib/stores/fetch-owner-store-order-counts.ts",
    rpc_name: "get_delivery_summary_snapshot",
    snapshot_table: "delivery_summary_snapshots",
    verify_rpc_script: "verify:delivery-summary-snapshot-rpc",
    verify_e2e_script: "verify:delivery-summary-snapshot-e2e",
    reconnect_related: 0,
    structural_pass: 1,
    hard_deleted: 1,
  },
  {
    track: "OOL1",
    route: "/api/me/stores/[storeId]/orders",
    fallback_branch: "legacy_2_wave_aggregate",
    legacy_module: "lib/stores/fetch-owner-store-orders-list-legacy.ts",
    legacy_builder: "buildOwnerStoreOrdersListLegacy",
    rpc_name: "get_owner_store_orders_list_snapshot",
    snapshot_table: "owner_store_orders_list_snapshots",
    verify_rpc_script: "verify:owner-orders-list-snapshot-rpc",
    verify_e2e_script: "verify:owner-orders-list-snapshot-e2e",
    reconnect_related: 0,
    structural_pass: 1,
  },
  {
    track: "CR1",
    route: "/api/chat/rooms",
    fallback_branch: "legacy_7_wave_monolith",
    legacy_module: "lib/chats/fetch-chat-rooms-list-legacy.ts",
    legacy_builder: "buildChatRoomsListLegacy",
    rpc_name: "get_chat_rooms_snapshot",
    snapshot_table: "chat_rooms_snapshots",
    verify_rpc_script: "verify:chat-rooms-snapshot-rpc",
    verify_e2e_script: "verify:chat-rooms-snapshot-e2e",
    reconnect_related: 1,
    structural_pass: 1,
  },
  {
    track: "SOD1",
    route: "/api/me/store-orders/[orderId]",
    fallback_branch: "legacy_5_rtt_detail",
    legacy_module: "lib/stores/fetch-store-order-detail-legacy.ts",
    legacy_builder: "buildBuyerStoreOrderDetailLegacy",
    rpc_name: "get_store_order_detail_snapshot",
    snapshot_table: "store_order_detail_snapshots",
    verify_rpc_script: "verify:store-order-detail-snapshot-rpc",
    verify_e2e_script: "verify:store-order-detail-snapshot-e2e",
    reconnect_related: 0,
    structural_pass: 1,
  },
  {
    track: "SOL1",
    route: "/api/me/store-orders",
    fallback_branch: "legacy_2_wave_list",
    legacy_module: "lib/stores/fetch-buyer-store-orders-list-legacy.ts",
    legacy_builder: "buildBuyerStoreOrdersListLegacy",
    rpc_name: "get_buyer_store_orders_list_snapshot",
    snapshot_table: "buyer_store_orders_list_snapshots",
    verify_rpc_script: "verify:buyer-orders-list-snapshot-rpc",
    verify_e2e_script: "verify:buyer-orders-list-snapshot-e2e",
    reconnect_related: 0,
    structural_pass: 1,
  },
  {
    track: "SB1",
    route: "/api/stores/browse",
    fallback_branch: "legacy_taxonomy_stores_wave",
    legacy_module: "lib/stores/fetch-stores-browse-legacy.ts",
    legacy_builder: "buildStoresBrowseLegacy",
    rpc_name: "get_stores_browse_snapshot",
    snapshot_table: "stores_browse_snapshots",
    verify_rpc_script: "verify:stores-browse-snapshot-rpc",
    verify_e2e_script: "verify:stores-browse-snapshot-e2e",
    reconnect_related: 0,
    structural_pass: 1,
  },
  {
    track: "CMB1",
    route: "/api/community-messenger/bootstrap?lite=1",
    fallback_branch: "legacy_bootstrap_monolith",
    legacy_module: "lib/community-messenger/fetch-cm-bootstrap-legacy.ts",
    legacy_builder: "buildCmBootstrapLiteLegacy",
    rpc_name: "get_cm_bootstrap_critical_snapshot",
    snapshot_table: "community_messenger_bootstrap_snapshots",
    verify_rpc_script: "verify:cm-bootstrap-snapshot-rpc",
    verify_e2e_script: "verify:cm-bootstrap-snapshot-e2e",
    reconnect_related: 1,
    structural_pass: 1,
  },
  {
    track: "FBT1",
    route: "/api/community-messenger/bootstrap",
    fallback_branch: "legacy_full_bootstrap_monolith",
    legacy_module: "lib/community-messenger/fetch-full-bootstrap-legacy.ts",
    legacy_builder: "buildFullBootstrapLegacy",
    rpc_name: "get_cm_bootstrap_full_snapshot",
    snapshot_table: "community_messenger_bootstrap_snapshots",
    verify_rpc_script: "verify:full-bootstrap-snapshot-rpc",
    verify_e2e_script: "verify:full-bootstrap-snapshot-e2e",
    reconnect_related: 1,
    structural_pass: 1,
  },
  {
    track: "FBT1",
    route: "/api/community-messenger/bootstrap?tier=critical",
    fallback_branch: "legacy_critical_tier_monolith",
    legacy_module: "lib/community-messenger/fetch-full-bootstrap-legacy.ts",
    legacy_builder: "buildCriticalBootstrapLegacy",
    rpc_name: "get_cm_bootstrap_full_snapshot",
    snapshot_table: "community_messenger_bootstrap_snapshots",
    verify_rpc_script: "verify:full-bootstrap-snapshot-rpc",
    verify_e2e_script: "verify:full-bootstrap-snapshot-e2e",
    reconnect_related: 1,
    structural_pass: 1,
  },
] as const;

export class LegacyFallbackBlockedError extends Error {
  readonly code = "legacy_fallback_blocked" as const;
  constructor(
    readonly route: string,
    readonly fallback_branch: string,
    readonly block_reason: string
  ) {
    super(`[LFC1] legacy fallback blocked: ${route} (${fallback_branch}) — ${block_reason}`);
    this.name = "LegacyFallbackBlockedError";
  }
}

function parseRouteAllowlist(envValue: string | undefined): Set<string> | null {
  const raw = envValue?.trim();
  if (!raw) return null;
  if (raw === "*" || raw === "all") return new Set(LEGACY_FALLBACK_ROUTE_REGISTRY.map((r) => r.route));
  return new Set(
    raw
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

/** Global snapshot-only mode — blocks legacy execution (soft-disable). Default off. */
export function isSnapshotOnlyModeEnabled(): boolean {
  return process.env.SAMARKET_LFC1_SNAPSHOT_ONLY?.trim() === "1";
}

/** Per-route snapshot-only allowlist; falls back to global when unset. */
export function isRouteSnapshotOnly(route: string): boolean {
  if (isSnapshotOnlyModeEnabled()) return true;
  const allow = parseRouteAllowlist(process.env.SAMARKET_LFC1_SNAPSHOT_ONLY_ROUTES);
  return allow?.has(route) ?? false;
}

/** Hard-delete gate — requires OPS1-B prod sign-off count (default 3). */
export function ops1bSignoffPassCount(): number {
  const raw = process.env.SAMARKET_OPS1B_SIGNOFF_PASS_COUNT?.trim();
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

export function ops1bDeleteGateMet(): boolean {
  const required = Number(process.env.SAMARKET_OPS1B_SIGNOFF_REQUIRED?.trim() || "3");
  return ops1bSignoffPassCount() >= required;
}

/** Routes marked hard-deleted in env (comma-separated). Only valid when OPS1-B gate met. */
export function isLegacyFallbackHardDeleted(route: string, fallback_branch: string): boolean {
  if (!ops1bDeleteGateMet()) return false;
  const deleted = parseRouteAllowlist(process.env.SAMARKET_LFC1_HARD_DELETED_ROUTES);
  if (!deleted) return false;
  const key = `${route}::${fallback_branch}`;
  return deleted.has(route) || deleted.has(key);
}

export type LegacyFallbackDeleteGate = {
  can_delete: 0 | 1;
  blocker?: string;
};

/** LFC1 step 2 — delete condition probe (does not remove code). */
export function evaluateLegacyFallbackDeleteGate(input: {
  route: string;
  fallback_branch: string;
  rpc_deployed: boolean;
  snapshot_available: boolean;
  fallback_used_count: number;
  query_wave_2_ms: number;
  rpc_removed: number;
  manual_ui_pass?: boolean;
  reconnect_stress_pass?: boolean;
  burst_stress_pass?: boolean;
}): LegacyFallbackDeleteGate {
  if (!input.rpc_deployed) return { can_delete: 0, blocker: "rpc_not_deployed" };
  if (!input.snapshot_available) return { can_delete: 0, blocker: "snapshot_table_or_row_missing" };
  if (input.fallback_used_count > 0) return { can_delete: 0, blocker: "fallback_used_nonzero" };
  if (input.query_wave_2_ms > 0) return { can_delete: 0, blocker: "query_wave_2_ms_nonzero" };
  if (input.rpc_removed !== 1) return { can_delete: 0, blocker: "rpc_removed_not_1" };
  if (!ops1bDeleteGateMet()) {
    return {
      can_delete: 0,
      blocker: `ops1b_signoff_insufficient (${ops1bSignoffPassCount()}/3)`,
    };
  }
  if (input.manual_ui_pass === false) return { can_delete: 0, blocker: "manual_ui_not_pass" };
  if (input.reconnect_stress_pass === false) return { can_delete: 0, blocker: "reconnect_stress_not_pass" };
  if (input.burst_stress_pass === false) return { can_delete: 0, blocker: "burst_stress_not_pass" };
  return { can_delete: 1 };
}

export function findLegacyFallbackRouteSpec(
  route: string,
  fallback_branch: string
): LegacyFallbackRouteSpec | undefined {
  return LEGACY_FALLBACK_ROUTE_REGISTRY.find(
    (r) => r.route === route && r.fallback_branch === fallback_branch
  );
}
