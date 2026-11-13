import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { isLinkedSamarketStoreAddressRow } from "@/lib/addresses/is-linked-samarket-store-address";
import { ADDR_LIST_BADGE_BASE } from "@/lib/ui/address-flow-viber";

/**
 * 매장 메뉴 + 버튼(`lib/stores/store-menu-quick-add-button-styles.ts`, 배달 도메인) 전용 값 — 내정보 주소 목록은
 * 아래 `sam-*` 토큰 클래스만 쓴다(최종 설계 S06 하드코딩 제거). 배달 화면 시각 불변을 위해 값만 유지.
 */
export const ADDR_SB_GREEN = "#00704A";
export const ADDR_SB_MINT = "#D4E9E2";

export type AddressListRowSurface = "master" | "store" | "default";

export function resolveAddressListRowSurface(row: UserAddressDTO): AddressListRowSurface {
  if (isLinkedSamarketStoreAddressRow(row)) return "store";
  if (row.isDefaultMaster) return "master";
  return "default";
}

/** 주소 목록 행 바탕 — 대표 = 눌림 그린 + 왼쪽 시그니처 선, 매장 = 경고(브라운·골드) 톤, 기본 = 흰 행 */
export function addressListRowSurfaceClass(surface: AddressListRowSurface): string {
  switch (surface) {
    case "master":
      return "rounded-ui-rect border border-sam-primary/22 bg-sam-pressed-surface shadow-[inset_3px_0_0_0_var(--sam-primary)]";
    case "store":
      return "rounded-ui-rect border border-sam-warning/25 bg-sam-warning-soft/40 shadow-[inset_3px_0_0_0_var(--sam-warning)]";
    default:
      return "rounded-ui-rect border border-sam-border-soft bg-sam-surface";
  }
}

/** 라벨 뱃지(집·회사·매장·기타) */
export function addressDesignationBadgeClass(labelType: UserAddressDTO["labelType"]): string {
  switch (labelType) {
    case "home":
      return `${ADDR_LIST_BADGE_BASE} border-sam-primary/35 bg-sam-icon-surface text-sam-primary`;
    case "office":
      return `${ADDR_LIST_BADGE_BASE} border-sam-fg/25 bg-sam-surface-muted text-sam-fg`;
    case "shop":
      return `${ADDR_LIST_BADGE_BASE} border-sam-warning/35 bg-sam-warning-soft text-sam-warning`;
    case "other":
    default:
      return `${ADDR_LIST_BADGE_BASE} border-sam-border bg-sam-surface text-sam-muted`;
  }
}

export function addressMasterBadgeClass(): string {
  return `${ADDR_LIST_BADGE_BASE} border-sam-primary bg-sam-primary text-[var(--sam-icon-on-primary)]`;
}

export function addressStoreLinkedBadgeClass(): string {
  return `${ADDR_LIST_BADGE_BASE} border-sam-warning/40 bg-sam-warning text-sam-surface`;
}

export function addressTapRepresentativeBadgeClass(): string {
  return `${ADDR_LIST_BADGE_BASE} border-dashed border-sam-primary/45 bg-sam-surface font-semibold text-sam-primary`;
}
