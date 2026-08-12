import {
  formatAddressBookLineSegments,
} from "@/lib/addresses/address-book-line";
import type { FormatPhAddressCardOneLineOpts } from "@/lib/addresses/ph-address-display";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";

/**
 * `/mypage/addresses` · picker · Philife · cart owner row.
 * `gatePrefix` = user detail (bold, inline) · `streetBody` = rest of compact continuous string (no country).
 */
export type AddressBookCardPresentation = {
  gatePrefix: string;
  streetBody: string;
};

export function formatAddressBookCardPresentation(
  row: UserAddressDTO | null | undefined,
  opts?: FormatPhAddressCardOneLineOpts | null,
): AddressBookCardPresentation | null {
  const seg = formatAddressBookLineSegments(row, opts);
  if (!seg) return null;
  return {
    gatePrefix: (seg.detail ?? "").trim(),
    streetBody: (seg.rest ?? "").trim(),
  };
}

export function parseStoredAddressBookPresentation(
  raw: unknown,
): AddressBookCardPresentation | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const gatePrefix = typeof o.gatePrefix === "string" ? o.gatePrefix.trim() : "";
  const streetBody = typeof o.streetBody === "string" ? o.streetBody.trim() : "";
  if (!gatePrefix && !streetBody) return null;
  return { gatePrefix, streetBody };
}
