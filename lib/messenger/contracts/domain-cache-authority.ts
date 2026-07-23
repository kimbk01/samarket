/**
 * STEP 2 — Domain Cache Authority (existing Phase6 Persistent CachePort).
 *
 * Allowlist Domain surfaces only. Non-allowlist Legacy Authority unchanged.
 * Shadow observe must never call seed (Shadow write 0).
 *
 * Coexistence: Domain Realtime/Badge/Notification/Atomic Authorities CONNECTED
 * on allowlist Phase6 store. Dual writer vs Legacy on same surface remains forbidden.
 * All-user PHASE6_DOMAIN_CACHE_PRODUCTION_WIRING stays false. Legacy files remain.
 */
import type { ChatDomain } from "@/lib/chat-domain/chat-domain";
import { assertNoDualWrite } from "@/lib/messenger/contracts/cutover";
import {
  assertBootstrapRowsOwnDomainOnly,
  DOMAIN_BOOTSTRAP_SCHEMA_VERSION,
  PHASE6_DOMAIN_CACHE_PRODUCTION_WIRING,
} from "@/lib/messenger/contracts/domain-bootstrap-cache";
import type {
  DomainCacheSnapshot,
  DomainCacheWriteContext,
} from "@/lib/messenger/contracts/persistent-cache-port";
import {
  isPhase11dAAllowlisted,
  isPhase11dACanaryKilled,
  PHASE11D_A_CACHE_WRITE,
} from "@/lib/messenger/contracts/phase11da-canary-gate";
import { generalDirectPhase6Cache } from "@/lib/messenger/general-direct/phase6-bootstrap";
import { groupPhase6Cache } from "@/lib/messenger/group/phase6-bootstrap";
import { tradePhase6Cache } from "@/lib/messenger/trade/phase6-bootstrap";
import {
  buildStoreOrderCacheKeyForSurface,
  storeOrderPhase6Cache,
} from "@/lib/messenger/store-order/phase6-bootstrap";
import type { GeneralDirectListItem } from "@/lib/messenger/general-direct/types";
import type { GroupListItem } from "@/lib/messenger/group/types";
import type { TradeListItem } from "@/lib/messenger/trade/types";
import type { StoreOrderListItem } from "@/lib/messenger/store-order/types";

export type { DomainCacheWriteContext };

/** Stable viewer×domain authority key — generation lives inside snapshot, not in key. */
export function buildDomainCacheAuthorityKey(input: {
  domain: ChatDomain;
  viewerUserId: string;
  surfaceRole?: "customer" | "owner" | null;
}): string {
  const viewer = input.viewerUserId.trim();
  if (!viewer) throw new Error("dibay_domain_cache_authority_viewer_required");
  if (input.domain === "general_direct") {
    return generalDirectPhase6Cache.buildCacheKey({ viewerUserId: viewer });
  }
  if (input.domain === "group") {
    return groupPhase6Cache.buildCacheKey({ viewerUserId: viewer });
  }
  if (input.domain === "trade") {
    return tradePhase6Cache.buildCacheKey({ viewerUserId: viewer });
  }
  if (input.domain === "store_order") {
    const role = input.surfaceRole ?? "customer";
    if (role === "owner") {
      throw new Error("dibay_domain_cache_authority_store_order_owner_excluded");
    }
    return buildStoreOrderCacheKeyForSurface({
      viewerUserId: viewer,
      surfaceRole: "customer",
    });
  }
  throw new Error("dibay_domain_cache_authority_unknown_domain");
}

export function assertDomainCacheAuthorityWritersContract(): void {
  if (!PHASE11D_A_CACHE_WRITE) {
    throw new Error("dibay_domain_cache_authority_requires_cache_write_flag");
  }
  if (PHASE6_DOMAIN_CACHE_PRODUCTION_WIRING) {
    throw new Error("dibay_phase6_cache_all_user_wiring_must_remain_false");
  }
  assertNoDualWrite(["domain"]);
}

/**
 * Domain Cache Authority is ON only for allowlist viewers while flag is true and not killed.
 * Non-allowlist → Legacy Cache Authority (no Domain seed).
 */
export function isDomainCacheAuthorityEnabledForViewer(viewerUserId: string): boolean {
  if (!PHASE11D_A_CACHE_WRITE) return false;
  if (isPhase11dACanaryKilled()) return false;
  if (!isPhase11dAAllowlisted(viewerUserId)) return false;
  return true;
}

/** Legacy EarlyWarm / Legacy bootstrap-cache must not run for Domain Cache Authority viewers. */
export function shouldBlockLegacyHomeCacheWarm(viewerUserId: string | null | undefined): boolean {
  const uid = viewerUserId?.trim() ?? "";
  if (!uid) return false;
  return isDomainCacheAuthorityEnabledForViewer(uid);
}

export type DomainCacheSeedRow = {
  roomId: string;
  domainIdentityKey: string;
  chatDomain?: string | null;
};

function dedupeByCanonicalIdentity<T extends DomainCacheSeedRow>(
  domain: ChatDomain,
  rows: ReadonlyArray<T>
): { rows: T[]; duplicateIdentityKeys: string[] } {
  const byIdentity = new Map<string, T>();
  const duplicates: string[] = [];
  for (const row of rows) {
    const chatDomain = String(row.chatDomain ?? "").trim();
    const key = String(row.domainIdentityKey ?? "").trim();
    if (chatDomain !== domain) {
      throw new Error(`dibay_bootstrap_foreign_domain_row:${domain}:${chatDomain}`);
    }
    if (!key.startsWith(`${domain}:`)) {
      throw new Error(`dibay_bootstrap_identity_prefix_mismatch:${domain}`);
    }
    const prev = byIdentity.get(key);
    if (prev) {
      duplicates.push(key);
      // Deterministic winner for Cache only — never delete DB rooms / merge messages.
      if (row.roomId.localeCompare(prev.roomId) > 0) {
        byIdentity.set(key, row);
      }
      continue;
    }
    byIdentity.set(key, row);
  }
  // Distinct-identity contract still enforced for non-duplicate rows.
  assertBootstrapRowsOwnDomainOnly(domain, [...byIdentity.values()]);
  return { rows: [...byIdentity.values()], duplicateIdentityKeys: [...new Set(duplicates)] };
}

export function seedDomainCacheAuthoritySnapshot<T extends DomainCacheSeedRow>(input: {
  domain: ChatDomain;
  viewerUserId: string;
  generation: string;
  producedAt: string;
  rows: ReadonlyArray<T>;
  surfaceRole?: "customer" | "owner" | null;
}): {
  seeded: boolean;
  key: string;
  rowCount: number;
  duplicateIdentityKeys: ReadonlyArray<string>;
  skippedReason?: string;
} {
  const viewer = input.viewerUserId.trim();
  if (!isDomainCacheAuthorityEnabledForViewer(viewer)) {
    return {
      seeded: false,
      key: "",
      rowCount: 0,
      duplicateIdentityKeys: [],
      skippedReason: "authority_off_or_not_allowlisted",
    };
  }
  assertDomainCacheAuthorityWritersContract();
  if (input.domain === "store_order" && input.surfaceRole === "owner") {
    return {
      seeded: false,
      key: "",
      rowCount: 0,
      duplicateIdentityKeys: [],
      skippedReason: "owner_excluded",
    };
  }

  const { rows, duplicateIdentityKeys } = dedupeByCanonicalIdentity(input.domain, input.rows);
  const key = buildDomainCacheAuthorityKey({
    domain: input.domain,
    viewerUserId: viewer,
    surfaceRole: input.domain === "store_order" ? "customer" : null,
  });
  const snapshot: DomainCacheSnapshot<T> = {
    domain: input.domain,
    viewerUserId: viewer,
    generation: input.generation,
    schemaVersion: DOMAIN_BOOTSTRAP_SCHEMA_VERSION,
    producedAt: input.producedAt,
    rows,
    surfaceRole: input.domain === "store_order" ? "customer" : null,
  };

  // Seed rows are domain list items at call sites; SeedRow is the shared identity floor.
  if (input.domain === "general_direct") {
    generalDirectPhase6Cache.writeFullSnapshot(
      key,
      snapshot as unknown as DomainCacheSnapshot<GeneralDirectListItem>,
      "domain_cache_authority"
    );
  } else if (input.domain === "group") {
    groupPhase6Cache.writeFullSnapshot(
      key,
      snapshot as unknown as DomainCacheSnapshot<GroupListItem>,
      "domain_cache_authority"
    );
  } else if (input.domain === "trade") {
    tradePhase6Cache.writeFullSnapshot(
      key,
      snapshot as unknown as DomainCacheSnapshot<TradeListItem>,
      "domain_cache_authority"
    );
  } else {
    storeOrderPhase6Cache.writeFullSnapshot(
      key,
      snapshot as unknown as DomainCacheSnapshot<StoreOrderListItem>,
      "domain_cache_authority"
    );
  }

  return {
    seeded: true,
    key,
    rowCount: rows.length,
    duplicateIdentityKeys,
  };
}

export function hydrateDomainCacheAuthoritySnapshot<T>(input: {
  domain: ChatDomain;
  viewerUserId: string;
  surfaceRole?: "customer" | "owner" | null;
}): DomainCacheSnapshot<T> | null {
  const viewer = input.viewerUserId.trim();
  if (!isDomainCacheAuthorityEnabledForViewer(viewer)) return null;
  const key = buildDomainCacheAuthorityKey({
    domain: input.domain,
    viewerUserId: viewer,
    surfaceRole: input.domain === "store_order" ? "customer" : input.surfaceRole,
  });
  if (input.domain === "general_direct") {
    return generalDirectPhase6Cache.readSnapshot(key) as DomainCacheSnapshot<T> | null;
  }
  if (input.domain === "group") {
    return groupPhase6Cache.readSnapshot(key) as DomainCacheSnapshot<T> | null;
  }
  if (input.domain === "trade") {
    return tradePhase6Cache.readSnapshot(key) as DomainCacheSnapshot<T> | null;
  }
  return storeOrderPhase6Cache.readSnapshot(key) as DomainCacheSnapshot<T> | null;
}

export function rollbackDomainCacheAuthority(viewerUserId: string): {
  cleared: true;
  domains: ReadonlyArray<ChatDomain>;
} {
  const viewer = viewerUserId.trim();
  const domains: ChatDomain[] = ["general_direct", "group", "trade", "store_order"];
  // Allow clear even when flag flipped off during kill — use authority context when enabled, else test clear path via isolated.
  const ctx: DomainCacheWriteContext = PHASE11D_A_CACHE_WRITE
    ? "domain_cache_authority"
    : "isolated_harness";
  generalDirectPhase6Cache.clearViewerDomain(viewer, ctx === "domain_cache_authority" ? ctx : "isolated_harness");
  groupPhase6Cache.clearViewerDomain(viewer, ctx === "domain_cache_authority" ? ctx : "isolated_harness");
  tradePhase6Cache.clearViewerDomain(viewer, ctx === "domain_cache_authority" ? ctx : "isolated_harness");
  storeOrderPhase6Cache.clearViewerDomain(viewer, ctx === "domain_cache_authority" ? ctx : "isolated_harness");
  return { cleared: true, domains };
}

export function listDomainCacheAuthoritySurfaces(): ReadonlyArray<{
  domain: ChatDomain;
  surface: "default" | "customer";
  authority: "DOMAIN_AUTHORITY" | "OFF";
}> {
  if (!PHASE11D_A_CACHE_WRITE) {
    return [
      { domain: "general_direct", surface: "default", authority: "OFF" },
      { domain: "group", surface: "default", authority: "OFF" },
      { domain: "trade", surface: "default", authority: "OFF" },
      { domain: "store_order", surface: "customer", authority: "OFF" },
    ];
  }
  return [
    { domain: "general_direct", surface: "default", authority: "DOMAIN_AUTHORITY" },
    { domain: "group", surface: "default", authority: "DOMAIN_AUTHORITY" },
    { domain: "trade", surface: "default", authority: "DOMAIN_AUTHORITY" },
    { domain: "store_order", surface: "customer", authority: "DOMAIN_AUTHORITY" },
  ];
}
