/**
 * REBUILD 14 P5 — CTA INTERNAL_DESTINATION registry (keys + product intent).
 *
 * Admin selects keys, not raw URLs.
 * Route mapping = integration metadata for later handoff (not Production navigation).
 */

import {
  CTA_INTERNAL_DESTINATIONS,
  isCtaInternalDestination,
  type CtaInternalDestination,
} from "@/lib/startup-compositor/registries/cta";
import type { AuthorityClassification } from "@/lib/startup-compositor/execution/geometry";

export type CtaDestinationRecord = {
  readonly key: CtaInternalDestination;
  readonly productIntent: string;
  /** Integration metadata only — not executed in P5. */
  readonly routeMapping: string;
  readonly sourceAuthority: AuthorityClassification;
  readonly status: "REGISTERED";
};

/**
 * Canonical destination table.
 * Keys: EXISTING_PRODUCT_CONTRACT (P1 document + registries/cta).
 * Routes: EXISTING_PRODUCT_CONTRACT (main pillar paths) — not Owner-locked by P5.
 */
export const CTA_DESTINATION_TABLE: Readonly<
  Record<CtaInternalDestination, CtaDestinationRecord>
> = {
  community: {
    key: "community",
    productIntent: "Community / Philife hub",
    routeMapping: "/philife",
    sourceAuthority: "EXISTING_PRODUCT_CONTRACT",
    status: "REGISTERED",
  },
  trade: {
    key: "trade",
    productIntent: "Trade / Market home",
    routeMapping: "/market",
    sourceAuthority: "EXISTING_PRODUCT_CONTRACT",
    status: "REGISTERED",
  },
  food: {
    key: "food",
    productIntent: "Food / Store delivery browse",
    routeMapping: "/stores",
    sourceAuthority: "EXISTING_PRODUCT_CONTRACT",
    status: "REGISTERED",
  },
  chat: {
    key: "chat",
    productIntent: "Community messenger",
    routeMapping: "/community-messenger",
    sourceAuthority: "EXISTING_PRODUCT_CONTRACT",
    status: "REGISTERED",
  },
  my: {
    key: "my",
    productIntent: "My page / profile",
    routeMapping: "/mypage",
    sourceAuthority: "EXISTING_PRODUCT_CONTRACT",
    status: "REGISTERED",
  },
};

export function resolveCtaDestination(
  key: unknown,
):
  | { readonly ok: true; readonly value: CtaDestinationRecord }
  | { readonly ok: false; readonly reason: string } {
  if (typeof key !== "string") {
    return { ok: false, reason: "destination_not_string" };
  }
  if (
    key.includes("://") ||
    key.startsWith("/") ||
    key.includes(".") ||
    key.includes("?")
  ) {
    return { ok: false, reason: "raw_url_rejected" };
  }
  if (!isCtaInternalDestination(key)) {
    return { ok: false, reason: "unknown_destination_key" };
  }
  return { ok: true, value: CTA_DESTINATION_TABLE[key] };
}

export function listCtaDestinationKeys(): readonly CtaInternalDestination[] {
  return CTA_INTERNAL_DESTINATIONS;
}

export { CTA_INTERNAL_DESTINATIONS, isCtaInternalDestination };
