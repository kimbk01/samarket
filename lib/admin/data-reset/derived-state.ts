/**
 * DIBAY Data Reset — server derived state + client invalidation namespaces.
 * Extends existing Data Reset SSOT. No auth wipe, no finance, no native.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { HUB_BADGE_UNREAD_COUNTERS_TABLE } from "@/lib/chat/hub-badge-unread-counter";
import type { DataResetDomain } from "@/lib/admin/data-reset/types";

export type DerivedStateOperation =
  | "DELETE"
  | "RESET_VALUE"
  | "RECOMPUTE"
  | "INVALIDATE"
  | "PRESERVE";

export type DataResetDerivedTarget = {
  kind: string;
  ownerDomain: DataResetDomain | "cross";
  operation: DerivedStateOperation;
  identity: string;
  estimatedRows: number;
  notes: string;
};

export type DataResetClientInvalidationNamespace =
  | "community_feed"
  | "market_feed"
  | "delivery_browse"
  | "chat_bootstrap"
  | "chat_room_snapshots"
  | "friend_lists"
  | "hub_badge_memory";

/** Inventory evidence — SOURCE / DERIVED / WRITER / READER / RESET REQUIRED. */
export const DATA_RESET_DERIVED_INVENTORY = [
  {
    domain: "community" as const,
    sourceOfTruth: "community_posts (+ likes/comments CASCADE)",
    derived: "philife neighborhood feed persistent cache · community_hub_state_v1 (nav only)",
    writer: "community write APIs · philife-feed-session-cache",
    reader: "philife feed UI",
    resetRequired: true,
    operation: "INVALIDATE" as const,
    clientNamespaces: ["community_feed"] as const,
    notes: "Post rows deleted by domain DB reset; feed cache must not re-show deleted posts",
  },
  {
    domain: "market" as const,
    sourceOfTruth: "posts",
    derived: "samarket:home-posts:v1:* · trade-feed-client-cache · home-posts-route-core memory",
    writer: "getPostsForHome / home-posts-route-core",
    reader: "HomeProductList / market browse",
    resetRequired: true,
    operation: "INVALIDATE" as const,
    clientNamespaces: ["market_feed"] as const,
    notes: "Listing DB delete ≠ list cache clear",
  },
  {
    domain: "delivery" as const,
    sourceOfTruth: "store_products / stores (operating)",
    derived: "store-home-feed server+client · stores-browse session/memory",
    writer: "store-home-feed-server-cache · stores-browse-*-cache",
    reader: "delivery browse / home feed",
    resetRequired: true,
    operation: "INVALIDATE" as const,
    clientNamespaces: ["delivery_browse"] as const,
    notes: "Finance/cart auth-bound prefs PRESERVE; browse snapshots INVALIDATE",
  },
  {
    domain: "chat" as const,
    sourceOfTruth: "community_messenger_rooms (+ soft deleted_at) · participants.unread_count",
    derived: "hub_badge_user_unread_counters · messenger bootstrap session · room snapshots",
    writer: "hub-badge-unread-counter upsert · bootstrap-cache · room-snapshot-cache",
    reader: "owner hub badge · messenger home",
    resetRequired: true,
    operation: "DELETE" as const,
    clientNamespaces: ["chat_bootstrap", "chat_room_snapshots", "hub_badge_memory"] as const,
    notes: "B4 soft/detach preserved; derived counters invalidated — no hard message wipe",
  },
  {
    domain: "friend" as const,
    sourceOfTruth: "user_social_relations",
    derived: "messenger friend/list projections (bootstrap)",
    writer: "friend relation APIs",
    reader: "messenger home friend surfaces",
    resetRequired: true,
    operation: "INVALIDATE" as const,
    clientNamespaces: ["friend_lists", "chat_bootstrap"] as const,
    notes: "No separate friend counter table — invalidate messenger bootstrap",
  },
  {
    domain: "member" as const,
    sourceOfTruth: "profiles / auth.users",
    derived: "profile/session client caches",
    writer: "auth + profile APIs",
    reader: "app shell",
    resetRequired: false,
    operation: "PRESERVE" as const,
    clientNamespaces: [] as const,
    notes: "Auth session / device binding LOCKED — Member auth purge is separate CUT",
  },
  {
    domain: "finance" as const,
    sourceOfTruth: "ledgers / gift / cash / coin",
    derived: "balance projections",
    writer: "finance domain",
    reader: "finance UI",
    resetRequired: false,
    operation: "PRESERVE" as const,
    clientNamespaces: [] as const,
    notes: "Finance hard reset LOCKED — never touch in this CUT",
  },
] as const;

export const DATA_RESET_CLIENT_INVALIDATION_FORBIDDEN = {
  localStorageClear: false,
  sessionStorageClear: false,
  preferencesClearAll: false,
  wipeClientSessionState: false,
  authSignOut: false,
  deviceBindingDelete: false,
  nativeCallLifecycle: false,
} as const;

export function resolveDerivedStateResetPlan(input: {
  domain: DataResetDomain;
  scope: string;
}): {
  derivedStateTargets: DataResetDerivedTarget[];
  clientInvalidation: DataResetClientInvalidationNamespace[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const targets: DataResetDerivedTarget[] = [];
  const client = new Set<DataResetClientInvalidationNamespace>();

  const pushClient = (ns: readonly DataResetClientInvalidationNamespace[]) => {
    for (const n of ns) client.add(n);
  };

  const add = (t: DataResetDerivedTarget) => {
    targets.push(t);
  };

  switch (input.domain) {
    case "community":
      add({
        kind: "community_feed_cache",
        ownerDomain: "community",
        operation: "INVALIDATE",
        identity: "philife_neighborhood_feed_persistent+community_author_caches",
        estimatedRows: 0,
        notes: "Client/session feed caches — not DB TRUNCATE",
      });
      pushClient(["community_feed"]);
      break;
    case "market":
      add({
        kind: "market_feed_cache",
        ownerDomain: "market",
        operation: "INVALIDATE",
        identity: "home_posts_client+server_memory+trade_feed_client",
        estimatedRows: 0,
        notes: "Prevent deleted listings resurfacing from cache",
      });
      pushClient(["market_feed"]);
      break;
    case "delivery":
      add({
        kind: "delivery_browse_cache",
        ownerDomain: "delivery",
        operation: "INVALIDATE",
        identity: "store_home_feed+stores_browse_memory_session",
        estimatedRows: 0,
        notes: "Operating product wipe must clear browse snapshots",
      });
      pushClient(["delivery_browse"]);
      break;
    case "chat":
      add({
        kind: "hub_badge_user_unread_counters",
        ownerDomain: "chat",
        operation: "DELETE",
        identity: HUB_BADGE_UNREAD_COUNTERS_TABLE,
        estimatedRows: -1,
        notes: "Derived counter rows deleted; recompute on next hub badge read",
      });
      add({
        kind: "messenger_bootstrap_snapshots",
        ownerDomain: "chat",
        operation: "INVALIDATE",
        identity: "samarket.messenger.bootstrap.*",
        estimatedRows: 0,
        notes: "Client bootstrap + room snapshot caches",
      });
      pushClient(["chat_bootstrap", "chat_room_snapshots", "hub_badge_memory"]);
      warnings.push("chat_derived_soft_detach_rooms_preserved_b4");
      break;
    case "friend":
      add({
        kind: "friend_list_projections",
        ownerDomain: "friend",
        operation: "INVALIDATE",
        identity: "messenger_bootstrap_friend_surfaces",
        estimatedRows: 0,
        notes: "No dedicated friend counter table",
      });
      pushClient(["friend_lists", "chat_bootstrap"]);
      break;
    case "member":
      add({
        kind: "auth_session",
        ownerDomain: "member",
        operation: "PRESERVE",
        identity: "supabase_auth_session+device_binding",
        estimatedRows: 0,
        notes: "Member auth purge LOCKED",
      });
      warnings.push("member_auth_session_preserved");
      break;
    case "finance":
      add({
        kind: "finance_balances",
        ownerDomain: "finance",
        operation: "PRESERVE",
        identity: "ledgers_gift_cash_coin",
        estimatedRows: 0,
        notes: "Finance hard reset LOCKED",
      });
      warnings.push("finance_derived_preserved");
      break;
    case "full":
      // Composed from child plans in planner — leave empty here; planner merges children.
      warnings.push("full_derived_from_child_domains");
      break;
    default:
      break;
  }

  return {
    derivedStateTargets: targets,
    clientInvalidation: [...client].sort(),
    warnings,
  };
}

export function derivedTargetsHashIdentity(
  targets: readonly DataResetDerivedTarget[]
): Array<{ kind: string; identity: string; operation: string }> {
  return [...targets]
    .map((t) => ({ kind: t.kind, identity: t.identity, operation: t.operation }))
    .sort((a, b) => `${a.kind}:${a.identity}`.localeCompare(`${b.kind}:${b.identity}`));
}

export function clientInvalidationHashIdentity(
  namespaces: readonly string[]
): string[] {
  return [...namespaces].map(String).sort();
}

/**
 * Server-side derived mutations only. Client namespaces are returned for browser apply.
 * Never touches auth.users, device tokens, finance ledgers, or native.
 */
export async function executeDerivedStateReset(input: {
  sb: SupabaseClient;
  targets: readonly DataResetDerivedTarget[];
}): Promise<{ counts: Record<string, number>; errors: string[]; detail: string }> {
  const counts: Record<string, number> = {};
  const errors: string[] = [];

  for (const t of input.targets) {
    if (t.operation === "PRESERVE" || t.operation === "INVALIDATE" || t.operation === "RECOMPUTE") {
      counts[`${t.kind}_${t.operation.toLowerCase()}`] = 0;
      continue;
    }

    if (t.operation === "DELETE" && t.identity === HUB_BADGE_UNREAD_COUNTERS_TABLE) {
      const { error, count } = await input.sb
        .from(HUB_BADGE_UNREAD_COUNTERS_TABLE)
        .delete({ count: "exact" })
        .neq("user_id", "00000000-0000-0000-0000-000000000000");
      if (error) {
        const msg = error.message ?? "";
        if (msg.includes("does not exist") || error.code === "42P01") {
          counts.hub_badge_counters_missing = 0;
        } else {
          errors.push(`hub_badge_counters:${msg}`);
        }
      } else {
        counts.hub_badge_user_unread_counters = count ?? 0;
      }
      continue;
    }

    if (t.operation === "RESET_VALUE") {
      counts[`${t.kind}_reset_skipped`] = 0;
      continue;
    }
  }

  // Process-local server memory caches (same Node that served Admin execute).
  try {
    const { clearStoreHomeFeedServerCache } = await import(
      "@/lib/stores/store-home-feed-server-cache"
    );
    if (input.targets.some((t) => t.kind === "delivery_browse_cache")) {
      clearStoreHomeFeedServerCache();
      counts.store_home_feed_server_cache_cleared = 1;
    }
  } catch (e) {
    errors.push(`store_home_feed_cache:${String((e as Error)?.message || e)}`);
  }

  try {
    const { invalidateStoresBrowseMemoryCache } = await import(
      "@/lib/stores/stores-browse-response-cache"
    );
    if (input.targets.some((t) => t.kind === "delivery_browse_cache")) {
      invalidateStoresBrowseMemoryCache();
      counts.stores_browse_memory_cleared = 1;
    }
  } catch (e) {
    errors.push(`stores_browse_memory:${String((e as Error)?.message || e)}`);
  }

  try {
    const { clearHomePostsServerMemoryCache } = await import(
      "@/lib/posts/home-posts-route-core"
    );
    if (input.targets.some((t) => t.kind === "market_feed_cache")) {
      clearHomePostsServerMemoryCache();
      counts.home_posts_server_memory_cleared = 1;
    }
  } catch (e) {
    errors.push(`home_posts_server_memory:${String((e as Error)?.message || e)}`);
  }

  return {
    counts,
    errors,
    detail: errors.length
      ? `derived_partial_${errors.length}`
      : `derived_ok_${Object.keys(counts).length}`,
  };
}
