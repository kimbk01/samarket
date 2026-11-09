/**
 * 시/군 LGU 판정 핵심 — 도시·도 글자 → 전국 LGU(PSGC). 이름이 겹치면 null(추정 금지).
 * 회원 주소·매장·배달이 모두 이 함수(또는 이 함수를 쓰는 `address-location-ssot.server`)만 거친다 (주소 SSOT 5단계 2026-11-09).
 */
import { resolvePlatformPhLguFromAddressFields } from "@/lib/geo/ph-lgu/platform-ph-lgu";

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
