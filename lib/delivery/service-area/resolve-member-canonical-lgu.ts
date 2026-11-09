/**
 * Resolve member address → canonical platform LGU id (배달 판정).
 * 주소 SSOT 5단계 (2026-11-09): 회원 주소 위치 SSOT(`resolveAddressCanonicalLguId`)와 같은 판정 — 배달만 따로 판정하지 않는다.
 * (이전: 저장값 → 도시+도만 → 앱 동네 목록 형식·도 칸 지역 이름 행은 배달에서만 LGU 없음)
 */
import { resolveAddressCanonicalLguId } from "@/lib/addresses/address-location-ssot.server";

export { resolveCanonicalLguIdForAddressWrite } from "@/lib/addresses/address-lgu-resolve";

export type MemberAddressLguFields = {
  canonicalLguId?: string | null;
  cityMunicipality?: string | null;
  province?: string | null;
};

export function resolveMemberCanonicalLguId(addr: MemberAddressLguFields | null | undefined): string | null {
  if (!addr) return null;
  return resolveAddressCanonicalLguId(addr);
}
