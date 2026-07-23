/**
 * Phase H extension — Domain list writers (1 writer per Domain), slice-1 cutover.
 * Holds last projection per Domain. CM home `applyHomeListPatch` remains KEEP for paint.
 * DO NOT: replace home-list-patch · Native Call · speculative badge patches.
 */

import type { ChatDomain } from "@/lib/chat-domain/four-domain-freeze";
import type { DomainListItemDto } from "@/lib/chat-domain/list/domain-list-dto";
import type { SurfaceProjectionApplyResult } from "@/lib/chat-domain/projections/surface-projection-types";

export type DomainListProjectionSnapshot = {
  chatDomain: ChatDomain;
  items: DomainListItemDto[];
  versionMs: number;
};

const lastByDomain: Partial<Record<ChatDomain, DomainListProjectionSnapshot>> = {};

function assertDomain(
  expected: ChatDomain,
  snapshot: DomainListProjectionSnapshot,
): SurfaceProjectionApplyResult | null {
  if (snapshot.chatDomain !== expected) {
    return { status: "error", error: `domain_mismatch:${expected}` };
  }
  return null;
}

function applyForDomain(
  expected: ChatDomain,
  snapshot: DomainListProjectionSnapshot,
): SurfaceProjectionApplyResult {
  const bad = assertDomain(expected, snapshot);
  if (bad) return bad;
  lastByDomain[expected] = snapshot;
  return { status: "ok" };
}

export function getDomainListProjection(chatDomain: ChatDomain): DomainListProjectionSnapshot | null {
  return lastByDomain[chatDomain] ?? null;
}

export function applyGeneralDirectListProjection(
  snapshot: DomainListProjectionSnapshot,
): SurfaceProjectionApplyResult {
  return applyForDomain("general_direct", snapshot);
}

export function applyGroupListProjection(
  snapshot: DomainListProjectionSnapshot,
): SurfaceProjectionApplyResult {
  return applyForDomain("group", snapshot);
}

export function applyTradeListProjection(
  snapshot: DomainListProjectionSnapshot,
): SurfaceProjectionApplyResult {
  return applyForDomain("trade", snapshot);
}

export function applyStoreOrderListProjection(
  snapshot: DomainListProjectionSnapshot,
): SurfaceProjectionApplyResult {
  return applyForDomain("store_order", snapshot);
}

/** Route apply by chatDomain — used by dual-write / bootstrap. */
export function applyDomainListProjection(
  snapshot: DomainListProjectionSnapshot,
): SurfaceProjectionApplyResult {
  switch (snapshot.chatDomain) {
    case "general_direct":
      return applyGeneralDirectListProjection(snapshot);
    case "group":
      return applyGroupListProjection(snapshot);
    case "trade":
      return applyTradeListProjection(snapshot);
    case "store_order":
      return applyStoreOrderListProjection(snapshot);
    default:
      return { status: "error", error: "unknown_chat_domain" };
  }
}

/** @internal vitest */
export function __resetDomainListProjectionsForTest(): void {
  for (const k of Object.keys(lastByDomain) as ChatDomain[]) {
    delete lastByDomain[k];
  }
}
