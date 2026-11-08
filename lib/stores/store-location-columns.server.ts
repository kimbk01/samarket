/**
 * 매장 위치 칸(주소 SSOT 3단계) — 매장 바랑가이·시/군 PSGC 를 서버가 저장 시 결정.
 * 회원 주소(user_addresses.barangay / canonical_lgu_id)와 같은 기준이라 ②「바랑가이, 시/군」 표시·배달 판정이 한 값을 쓴다.
 * 입력은 매장 행의 두 형식(오너 폼: 앱 동네 목록 이름 / Google: 도·시/군) 모두.
 */
import { addressDisplayPartsFromStoreRow } from "@/lib/addresses/address-display-levels";
import { legacyLocationRowToLguId } from "@/lib/neighborhood/lgu-location.server";
import { resolveCanonicalLguIdForAddressWrite } from "@/lib/delivery/service-area/resolve-member-canonical-lgu";

export function computeStoreLocationColumns(row: {
  region?: string | null;
  city?: string | null;
  district?: string | null;
  address_line1?: string | null;
  formatted_address?: string | null;
  /** Google 구성에서 이미 아는 바랑가이(회원 주소 연결 저장) */
  barangayHint?: string | null;
}): { barangay: string | null; canonical_lgu_id: string | null } {
  const region = (row.region ?? "").trim();
  const city = (row.city ?? "").trim();
  const parts = addressDisplayPartsFromStoreRow({
    region,
    city,
    district: row.district ?? null,
    address_line1: row.address_line1 ?? null,
    formatted_address: row.formatted_address ?? null,
  });
  const lgu =
    legacyLocationRowToLguId(region, city) ??
    (city ? resolveCanonicalLguIdForAddressWrite({ cityMunicipality: city, province: region || null }) : null) ??
    (city ? resolveCanonicalLguIdForAddressWrite({ cityMunicipality: city, province: null }) : null);
  const barangay = (row.barangayHint ?? "").trim() || (parts?.barangay ?? "").trim() || null;
  return { barangay, canonical_lgu_id: lgu };
}
