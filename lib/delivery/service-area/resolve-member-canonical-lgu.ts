/**
 * Resolve member address → canonical platform LGU id.
 * Prefer persisted canonical_lgu_id; else resolve from structured fields (no free-text guess).
 */

import { resolvePlatformPhLguFromAddressFields } from "@/lib/geo/ph-lgu/platform-ph-lgu";

export type MemberAddressLguFields = {
  canonicalLguId?: string | null;
  cityMunicipality?: string | null;
  province?: string | null;
};

export function resolveMemberCanonicalLguId(addr: MemberAddressLguFields | null | undefined): string | null {
  if (!addr) return null;
  const persisted = (addr.canonicalLguId ?? "").trim();
  if (persisted) return persisted;

  const city = (addr.cityMunicipality ?? "").trim();
  if (!city) return null;

  const res = resolvePlatformPhLguFromAddressFields({
    cityMunicipality: city,
    province: addr.province ?? null,
  });
  if (res.status === "resolved" && res.canonicalId) return res.canonicalId;
  return null;
}

/** Safe resolve for write path — returns null when ambiguous / unresolved (do not guess). */
export function resolveCanonicalLguIdForAddressWrite(input: {
  cityMunicipality?: string | null;
  province?: string | null;
}): string | null {
  const city = (input.cityMunicipality ?? "").trim();
  if (!city) return null;
  const res = resolvePlatformPhLguFromAddressFields({
    cityMunicipality: city,
    province: input.province ?? null,
  });
  if (res.status === "resolved" && res.canonicalId) return res.canonicalId;
  return null;
}
