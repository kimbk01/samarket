/**
 * Phase 6 — Domain Persistent CachePort 제네릭 구현.
 * namespace 격리 · generation stale 거부 · clearAllDomains 금지.
 * write contexts: test · isolated_harness · domain_cache_authority · domain_realtime_authority.
 */
import type { ChatDomain } from "@/lib/chat-domain/chat-domain";
import {
  assertGenerationAllowsApply,
  assertPhase6DomainCacheWriteContext,
  type DomainPersistentCacheMetadata,
  type DomainTombstone,
  DOMAIN_BOOTSTRAP_SCHEMA_VERSION,
  PHASE6_DOMAIN_CACHE_PRODUCTION_WIRING,
} from "@/lib/messenger/contracts/domain-bootstrap-cache";
import {
  PHASE11D_A_CACHE_WRITE,
  PHASE11D_A_REALTIME_APPLY,
} from "@/lib/messenger/contracts/phase11da-canary-gate";

/** test / harness / STEP2 Cache Authority / STEP3 Realtime Authority */
export type DomainCacheWriteContext =
  | "test"
  | "isolated_harness"
  | "domain_cache_authority"
  | "domain_realtime_authority";

export type DomainCacheSnapshot<TRow> = Readonly<{
  domain: ChatDomain;
  viewerUserId: string;
  generation: string;
  schemaVersion: string;
  producedAt: string;
  rows: ReadonlyArray<TRow>;
  surfaceRole?: "customer" | "owner" | null;
}>;

function assertNamespace(domain: ChatDomain, ns: string, key: string): void {
  if (!key.startsWith(`${ns}.`)) {
    throw new Error(`dibay_cache_namespace_forbidden:${domain}:${key}`);
  }
  const foreign = (["chat.general", "chat.group", "chat.trade", "chat.store_order"] as const).filter(
    (p) => p !== ns
  );
  for (const f of foreign) {
    if (key.startsWith(`${f}.`)) {
      throw new Error(`dibay_cache_foreign_namespace:${domain}:${key}`);
    }
  }
}

function assertWriteContext(context: DomainCacheWriteContext): void {
  if (context === "test" || context === "isolated_harness") {
    assertPhase6DomainCacheWriteContext(context);
    return;
  }
  if (context === "domain_cache_authority") {
    if (!PHASE11D_A_CACHE_WRITE) {
      throw new Error("dibay_domain_cache_authority_flag_off");
    }
    if (PHASE6_DOMAIN_CACHE_PRODUCTION_WIRING) {
      throw new Error("dibay_phase6_cache_production_wiring_must_remain_false");
    }
    return;
  }
  if (context === "domain_realtime_authority") {
    if (!PHASE11D_A_REALTIME_APPLY) {
      throw new Error("dibay_domain_realtime_authority_flag_off");
    }
    if (PHASE6_DOMAIN_CACHE_PRODUCTION_WIRING) {
      throw new Error("dibay_phase6_cache_production_wiring_must_remain_false");
    }
    return;
  }
  throw new Error("dibay_phase6_cache_write_context_forbidden");
}

export type DomainPersistentCachePort<TRow> = Readonly<{
  domain: ChatDomain;
  namespacePrefix: string;
  buildCacheKey: (input: {
    viewerUserId: string;
    generation?: string | null;
    surfaceRole?: "customer" | "owner" | null;
  }) => string;
  readSnapshot: (key: string) => DomainCacheSnapshot<TRow> | null;
  writeFullSnapshot: (
    key: string,
    snapshot: DomainCacheSnapshot<TRow>,
    context: DomainCacheWriteContext
  ) => void;
  applyPartial: (
    key: string,
    patch: {
      generation: string;
      rows: ReadonlyArray<TRow & { roomId: string; domainIdentityKey: string }>;
      producedAt?: string;
    },
    context: DomainCacheWriteContext
  ) => DomainCacheSnapshot<TRow>;
  applyTombstones: (
    key: string,
    tombstones: ReadonlyArray<DomainTombstone>,
    generation: string,
    context: DomainCacheWriteContext
  ) => DomainCacheSnapshot<TRow>;
  clearViewerDomain: (viewerUserId: string, context: DomainCacheWriteContext) => void;
  inspectMetadata: (key: string) => DomainPersistentCacheMetadata | null;
  /** 금지 API — 항상 throw */
  clearAllDomains: () => never;
}>;

export function createDomainPersistentCachePort<TRow extends { roomId: string; domainIdentityKey: string }>(
  domain: ChatDomain,
  namespacePrefix: string
): DomainPersistentCachePort<TRow> {
  const store = new Map<string, DomainCacheSnapshot<TRow>>();

  function buildCacheKey(input: {
    viewerUserId: string;
    generation?: string | null;
    surfaceRole?: "customer" | "owner" | null;
  }): string {
    const viewer = input.viewerUserId.trim();
    if (!viewer) throw new Error(`dibay_cache_viewer_required:${domain}`);
    const role = input.surfaceRole ? `:surface:${input.surfaceRole}` : "";
    const genPart = input.generation?.trim() ? `:gen:${input.generation.trim()}` : "";
    const key = `${namespacePrefix}.snapshot.v${DOMAIN_BOOTSTRAP_SCHEMA_VERSION}:${viewer}:${domain}${role}${genPart}`;
    assertNamespace(domain, namespacePrefix, key);
    return key;
  }

  function readSnapshot(key: string): DomainCacheSnapshot<TRow> | null {
    assertNamespace(domain, namespacePrefix, key);
    return store.get(key) ?? null;
  }

  function writeFullSnapshot(
    key: string,
    snapshot: DomainCacheSnapshot<TRow>,
    context: DomainCacheWriteContext
  ): void {
    assertWriteContext(context);
    assertNamespace(domain, namespacePrefix, key);
    if (snapshot.domain !== domain) {
      throw new Error(`dibay_cache_domain_mismatch:${domain}:${snapshot.domain}`);
    }
    const current = store.get(key);
    if (current) {
      assertGenerationAllowsApply(snapshot.generation, current.generation);
    }
    store.set(key, snapshot);
  }

  function applyPartial(
    key: string,
    patch: {
      generation: string;
      rows: ReadonlyArray<TRow & { roomId: string; domainIdentityKey: string }>;
      producedAt?: string;
    },
    context: DomainCacheWriteContext
  ): DomainCacheSnapshot<TRow> {
    assertWriteContext(context);
    assertNamespace(domain, namespacePrefix, key);
    const current = store.get(key);
    if (!current) {
      throw new Error(`dibay_cache_partial_requires_existing:${domain}`);
    }
    assertGenerationAllowsApply(patch.generation, current.generation);
    // 빈 partial = no-op (wipe 금지)
    if (patch.rows.length === 0) {
      return current;
    }
    // Canonical identity merge — different identity never collapses.
    const byIdentity = new Map<string, TRow>();
    for (const row of current.rows) {
      byIdentity.set(row.domainIdentityKey, row);
    }
    for (const row of patch.rows) {
      byIdentity.set(row.domainIdentityKey, row);
    }
    const next: DomainCacheSnapshot<TRow> = {
      ...current,
      generation: patch.generation,
      producedAt: patch.producedAt ?? new Date().toISOString(),
      rows: [...byIdentity.values()],
    };
    store.set(key, next);
    return next;
  }

  function applyTombstones(
    key: string,
    tombstones: ReadonlyArray<DomainTombstone>,
    generation: string,
    context: DomainCacheWriteContext
  ): DomainCacheSnapshot<TRow> {
    assertWriteContext(context);
    assertNamespace(domain, namespacePrefix, key);
    const current = store.get(key);
    if (!current) throw new Error(`dibay_cache_tombstone_requires_existing:${domain}`);
    assertGenerationAllowsApply(generation, current.generation);
    const remove = new Set(
      tombstones
        .filter((t) => t.domain === domain)
        .map((t) => t.roomId.trim() || t.identityKey.trim())
    );
    const rows = current.rows.filter(
      (r) => !remove.has(r.roomId) && !remove.has(r.domainIdentityKey)
    );
    const next: DomainCacheSnapshot<TRow> = {
      ...current,
      generation,
      producedAt: new Date().toISOString(),
      rows,
    };
    store.set(key, next);
    return next;
  }

  function clearViewerDomain(viewerUserId: string, context: DomainCacheWriteContext): void {
    assertWriteContext(context);
    const prefix = `${namespacePrefix}.snapshot.v${DOMAIN_BOOTSTRAP_SCHEMA_VERSION}:${viewerUserId.trim()}:`;
    for (const key of [...store.keys()]) {
      if (key.startsWith(prefix) && key.includes(`:${domain}`)) {
        store.delete(key);
      }
    }
  }

  function inspectMetadata(key: string): DomainPersistentCacheMetadata | null {
    assertNamespace(domain, namespacePrefix, key);
    const snap = store.get(key);
    if (!snap) return null;
    return {
      domain: snap.domain,
      viewerUserId: snap.viewerUserId,
      generation: snap.generation,
      schemaVersion: snap.schemaVersion,
      updatedAt: snap.producedAt,
      rowCount: snap.rows.length,
      surfaceRole: snap.surfaceRole ?? null,
    };
  }

  return {
    domain,
    namespacePrefix,
    buildCacheKey,
    readSnapshot,
    writeFullSnapshot,
    applyPartial,
    applyTombstones,
    clearViewerDomain,
    inspectMetadata,
    clearAllDomains: () => {
      throw new Error(`dibay_cache_clear_all_domains_forbidden:${domain}`);
    },
  };
}
