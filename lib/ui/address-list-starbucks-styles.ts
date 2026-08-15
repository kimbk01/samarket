import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { isLinkedSamarketStoreAddressRow } from "@/lib/addresses/is-linked-samarket-store-address";
import { ADDR_LIST_BADGE_BASE } from "@/lib/ui/address-flow-viber";

/** Starbucks-inspired palette — 주소 관리 목록 전용 */
export const ADDR_SB_GREEN = "#00704A";
export const ADDR_SB_GREEN_DARK = "#1E3932";
export const ADDR_SB_MINT = "#D4E9E2";
export const ADDR_SB_CREAM = "#F2F0EB";
export const ADDR_SB_COFFEE = "#6F4E37";

export type AddressListRowSurface = "master" | "store" | "default";

export function resolveAddressListRowSurface(row: UserAddressDTO): AddressListRowSurface {
  if (isLinkedSamarketStoreAddressRow(row)) return "store";
  if (row.isDefaultMaster) return "master";
  return "default";
}

export function addressListRowSurfaceClass(surface: AddressListRowSurface): string {
  switch (surface) {
    case "master":
      return "rounded-ui-rect border border-[#00704A]/22 bg-[#E8F3EE] shadow-[inset_3px_0_0_0_#00704A]";
    case "store":
      return "rounded-ui-rect border border-[#6F4E37]/20 bg-[#F7F3ED] shadow-[inset_3px_0_0_0_#6F4E37]";
    default:
      return "rounded-ui-rect border border-sam-border bg-white shadow-sm";
  }
}

export function addressDesignationBadgeClass(labelType: UserAddressDTO["labelType"]): string {
  switch (labelType) {
    case "home":
      return `${ADDR_LIST_BADGE_BASE} border-[#00704A]/35 bg-[#D4E9E2] text-[#00704A]`;
    case "office":
      return `${ADDR_LIST_BADGE_BASE} border-[#1E3932]/30 bg-[#E6EFEC] text-[#1E3932]`;
    case "shop":
      return `${ADDR_LIST_BADGE_BASE} border-[#6F4E37]/35 bg-[#F2F0EB] text-[#6F4E37]`;
    case "other":
    default:
      return `${ADDR_LIST_BADGE_BASE} border-[#6F4E37]/25 bg-white text-[#6F4E37]`;
  }
}

export function addressMasterBadgeClass(): string {
  return `${ADDR_LIST_BADGE_BASE} border-[#00704A] bg-[#00704A] text-white`;
}

export function addressStoreLinkedBadgeClass(): string {
  return `${ADDR_LIST_BADGE_BASE} border-[#6F4E37]/40 bg-[#6F4E37] text-[#F2F0EB]`;
}

export function addressTapRepresentativeBadgeClass(): string {
  return `${ADDR_LIST_BADGE_BASE} border-dashed border-[#00704A]/45 bg-white font-semibold text-[#00704A]`;
}
