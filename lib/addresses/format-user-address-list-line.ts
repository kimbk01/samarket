import type { FormatPhAddressCardOneLineOpts } from "@/lib/addresses/ph-address-display";
import { formatAddressBookLine } from "@/lib/addresses/address-book-line";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import {
  buildAddressManagementListPrimaryLine,
  stripCountryFromAddressDisplayLine,
} from "@/lib/addresses/user-address-format";
import {
  formatAddressBookCardPresentation,
  type AddressBookCardPresentation,
} from "@/lib/addresses/address-book-card-presentation";

/**
 * 주소 표시 SSOT(③ 전체 주소)를 쓰는 나라의 행 — 필리핀·한국 (한국 주소 지원 2026-11-10).
 * 이름은 예전 그대로(호출처 다수) — 「PH 형식(상세가 한 줄에 함께) 표시」 여부로 읽는다.
 */
export function isPhUserAddressRow(row: UserAddressDTO): boolean {
  const c = (row.countryCode ?? "PH").trim().toUpperCase();
  return c === "PH" || c === "KR";
}

/**
 * 사용자 주소 목록·프로필·필라이프·사이드바 — **compact continuous plain**.
 * PH: `formatAddressBookLine` (detail-first, country excluded, natural wrap). 비PH: management primary + strip country.
 */
export function formatUserAddressListPlainLine(
  row: UserAddressDTO,
  opts?: FormatPhAddressCardOneLineOpts | null,
): string {
  if (isPhUserAddressRow(row)) {
    return formatAddressBookLine(row, opts) ?? "—";
  }
  return stripCountryFromAddressDisplayLine(
    buildAddressManagementListPrimaryLine(row),
    row.countryName,
  );
}

/** PH 카드 본문(gate+street) · 주소 관리·마이페이지·시트 공통 */
export function resolveUserAddressCardPresentation(
  row: UserAddressDTO | null | undefined,
  opts?: FormatPhAddressCardOneLineOpts | null,
): AddressBookCardPresentation | null {
  return formatAddressBookCardPresentation(row, opts);
}
