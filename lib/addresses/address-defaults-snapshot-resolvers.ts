import type { AddressBookCardPresentation } from "@/lib/addresses/address-book-card-presentation";
import { formatAddressBookCardPresentation } from "@/lib/addresses/address-book-card-presentation";
import type { AddressDefaultsSnapshot } from "@/lib/addresses/address-defaults-snapshot";
import { coerceUserAddressDTO } from "@/lib/addresses/coerce-user-address-dto";
import {
  formatUserAddressFull,
  formatUserAddressTitle,
} from "@/lib/addresses/user-address-display-ssot";
import { pickUserAddressMasterRow } from "@/lib/addresses/user-address-master-ssot";
import {
  normalizeDeliveryHomeHeaderDisplayLine,
  pickDeliveryHomeHeaderAddress,
  resolveDeliveryHomeHeaderDisplayLine,
  type DeliveryHomeHeaderAddressState,
} from "@/lib/addresses/delivery-home-header-address";
import type { UserAddressDefaultsDTO } from "@/lib/addresses/user-address-types";

function isPlainAddressPlaceholder(line: string | null | undefined): boolean {
  const t = line?.trim();
  if (!t) return true;
  return t === "—" || t === "-" || t === "주소 미입력";
}

function coerceDefaults(snapshot: AddressDefaultsSnapshot | null): UserAddressDefaultsDTO | null {
  if (!snapshot?.ok || !snapshot.defaults) return null;
  return {
    delivery: null,
    master: coerceUserAddressDTO(snapshot.defaults.master),
    trade: null,
    life: null,
  };
}

/** Philife·거래 탐색 헤더 — master TITLE only. */
export function resolveExplorationAddressLineFromSnapshot(snapshot: AddressDefaultsSnapshot | null): string | null {
  const defaults = coerceDefaults(snapshot);
  if (!defaults) return null;
  const master = defaults.master;
  if (master?.id) {
    const chip = formatUserAddressTitle(master)?.trim();
    if (chip) return chip;
  }
  return null;
}

/** 내정보 — master FULL 한 줄만. 다른 기본지·생활 동네로 위장하지 않음. */
export function resolveRepresentativeFullAddressLineFromSnapshot(
  snapshot: AddressDefaultsSnapshot | null
): string | null {
  const defaults = coerceDefaults(snapshot);
  if (!defaults?.master?.id) return null;
  const masterLine = formatUserAddressFull(defaults.master)?.trim() ?? "";
  if (!isPlainAddressPlaceholder(masterLine)) return masterLine;
  return null;
}

export function resolveAddressBookPresentationFromSnapshot(
  snapshot: AddressDefaultsSnapshot | null
): AddressBookCardPresentation | null {
  const master = pickUserAddressMasterRow(snapshot?.defaults ?? null);
  if (!master?.id) return null;
  return formatAddressBookCardPresentation(master);
}

/** `/stores` 배달 홈 헤더 — master TITLE only. */
export function resolveDeliveryHomeHeaderStateFromSnapshot(
  snapshot: AddressDefaultsSnapshot | null
): DeliveryHomeHeaderAddressState {
  const defaults = coerceDefaults(snapshot);
  if (!defaults) {
    return { status: "ready", line: null, hasLinkedAddress: false };
  }

  const picked = pickDeliveryHomeHeaderAddress(defaults);
  const line =
    picked?.id ?
      normalizeDeliveryHomeHeaderDisplayLine(resolveDeliveryHomeHeaderDisplayLine(picked))
    : null;

  if (!picked?.id) {
    return { status: "ready", line: null, hasLinkedAddress: false };
  }

  return {
    status: "ready",
    line,
    hasLinkedAddress: true,
  };
}

/** 부트 직후 401 등으로 빈 스냅샷이면 로그인 후 재조회 */
export function shouldRetryAddressDefaultsSnapshotFetch(snapshot: AddressDefaultsSnapshot | null): boolean {
  if (snapshot == null) return true;
  if (snapshot.ok) return false;
  return snapshot.status === 401 || snapshot.status === 403;
}
