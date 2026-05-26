import {
  formatPhAddressCardOneLine,
  type FormatPhAddressCardOneLineOpts,
} from "@/lib/addresses/ph-address-display";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";

/** `/mypage/addresses` 카드 본문 — 세부(gate) + 가로(street) */
export type AddressBookCardPresentation = {
  gatePrefix: string;
  streetBody: string;
};

export function formatAddressBookCardPresentation(
  row: UserAddressDTO | null | undefined,
  opts?: FormatPhAddressCardOneLineOpts | null
): AddressBookCardPresentation | null {
  if (!row?.id) return null;
  const ph = formatPhAddressCardOneLine(row, opts);
  if (!ph.gatePrefix && !ph.streetBody) return null;
  return {
    gatePrefix: ph.gatePrefix.trim(),
    streetBody: ph.streetBody.trim(),
  };
}

export function parseStoredAddressBookPresentation(
  raw: unknown
): AddressBookCardPresentation | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const gatePrefix = typeof o.gatePrefix === "string" ? o.gatePrefix.trim() : "";
  const streetBody = typeof o.streetBody === "string" ? o.streetBody.trim() : "";
  if (!gatePrefix && !streetBody) return null;
  return { gatePrefix, streetBody };
}
