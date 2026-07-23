/**
 * Phase H — Domain list writers (1 writer per Domain).
 * Not wired to applyHomeListPatch yet (KEEP until cutover).
 */

import type { ChatDomain } from "@/lib/chat-domain/four-domain-freeze";
import type { DomainListItemDto } from "@/lib/chat-domain/list/domain-list-dto";
import {
  SURFACE_PROJECTION_NOT_WIRED,
  type SurfaceProjectionApplyResult,
} from "@/lib/chat-domain/projections/surface-projection-types";

export type DomainListProjectionSnapshot = {
  chatDomain: ChatDomain;
  items: DomainListItemDto[];
  versionMs: number;
};

function notWired(): SurfaceProjectionApplyResult {
  return { status: "not_wired", error: SURFACE_PROJECTION_NOT_WIRED };
}

export function applyGeneralDirectListProjection(
  _snapshot: DomainListProjectionSnapshot,
): SurfaceProjectionApplyResult {
  return notWired();
}

export function applyGroupListProjection(
  _snapshot: DomainListProjectionSnapshot,
): SurfaceProjectionApplyResult {
  return notWired();
}

export function applyTradeListProjection(
  _snapshot: DomainListProjectionSnapshot,
): SurfaceProjectionApplyResult {
  return notWired();
}

export function applyStoreOrderListProjection(
  _snapshot: DomainListProjectionSnapshot,
): SurfaceProjectionApplyResult {
  return notWired();
}
