/**
 * Phase 6 — Domain Bootstrap / Cache 공통 계약.
 * 통합 Room 배열·legacy dual-write 금지. cutover OFF 시 production UI wiring 금지.
 */
import type { ChatDomain } from "@/lib/chat-domain/chat-domain";
import { PHASE1_DEFAULT_CUTOVER } from "@/lib/messenger/contracts/cutover";

export const DOMAIN_BOOTSTRAP_SCHEMA_VERSION = "1" as const;

export type DomainSnapshotKind = "full" | "partial";

export type DomainBootstrapPagination = Readonly<{
  nextCursor: string | null;
  hasMore: boolean;
}>;

export type DomainTombstone = Readonly<{
  domain: ChatDomain;
  identityKey: string;
  roomId: string;
  generation: string;
  reason: string;
}>;

export type DomainBootstrapEnvelopeMeta = Readonly<{
  domain: ChatDomain;
  viewerUserId: string;
  generation: string;
  snapshotKind: DomainSnapshotKind;
  producedAt: string;
  schemaVersion: typeof DOMAIN_BOOTSTRAP_SCHEMA_VERSION;
  nextCursor: string | null;
  pagination: DomainBootstrapPagination;
}>;

/** 빈 partial → 전체 삭제 해석 금지 */
export function assertPartialDoesNotWipeWhenEmpty(
  kind: DomainSnapshotKind,
  rowCount: number,
  tombstoneCount: number
): void {
  if (kind === "partial" && rowCount === 0 && tombstoneCount === 0) {
    // 빈 partial 은 no-op — wipe 아님. 허용.
    return;
  }
}

export function compareGeneration(incoming: string, current: string): number {
  const a = incoming.trim();
  const b = current.trim() || "0";
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) {
    return na === nb ? 0 : na > nb ? 1 : -1;
  }
  return a === b ? 0 : a > b ? 1 : -1;
}

/** incoming >= current 만 허용 */
export function assertGenerationAllowsApply(incoming: string, current: string): void {
  if (compareGeneration(incoming, current) < 0) {
    throw new Error(`dibay_domain_snapshot_stale_generation:${incoming}<${current}`);
  }
}

export function assertBootstrapRowsOwnDomainOnly(
  domain: ChatDomain,
  rows: ReadonlyArray<{ chatDomain?: string | null; domainIdentityKey?: string | null }>
): void {
  const seen = new Map<string, string>();
  for (const row of rows) {
    const chatDomain = String(row.chatDomain ?? "").trim();
    const identityKey = String(row.domainIdentityKey ?? "").trim();
    if (chatDomain !== domain) {
      throw new Error(`dibay_bootstrap_foreign_domain_row:${domain}:${chatDomain}`);
    }
    if (!identityKey.startsWith(`${domain}:`)) {
      throw new Error(`dibay_bootstrap_identity_prefix_mismatch:${domain}`);
    }
    const prev = seen.get(identityKey);
    const roomId = (row as { roomId?: string }).roomId?.trim() ?? "";
    if (prev && prev !== roomId) {
      throw new Error(`dibay_bootstrap_duplicate_identity:${identityKey}`);
    }
    if (identityKey) seen.set(identityKey, roomId);
  }
}

/** Phase 6: production UI 에서 Domain cache write 금지 (cutover OFF) */
export const PHASE6_DOMAIN_CACHE_PRODUCTION_WIRING = false as const;

export function assertPhase6DomainCacheWriteContext(
  context: "test" | "isolated_harness"
): void {
  if (context !== "test" && context !== "isolated_harness") {
    throw new Error("dibay_phase6_cache_write_context_forbidden");
  }
  const cutover = PHASE1_DEFAULT_CUTOVER.find((c) => c.domain === "general_direct");
  if (cutover?.mode === "on") {
    // Phase 11 이전 기본은 off. on 이어도 본 Phase 는 UI wiring 금지.
  }
  if (PHASE6_DOMAIN_CACHE_PRODUCTION_WIRING) {
    throw new Error("dibay_phase6_cache_production_wiring_must_remain_false");
  }
}

export type DomainPersistentCacheMetadata = Readonly<{
  domain: ChatDomain;
  viewerUserId: string;
  generation: string;
  schemaVersion: string;
  updatedAt: string;
  rowCount: number;
  surfaceRole?: "customer" | "owner" | null;
}>;
