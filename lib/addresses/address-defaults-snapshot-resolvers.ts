import type { AddressBookCardPresentation } from "@/lib/addresses/address-book-card-presentation";
import { formatAddressBookCardPresentation } from "@/lib/addresses/address-book-card-presentation";
import type { AddressDefaultsSnapshot } from "@/lib/addresses/address-defaults-snapshot";
import { coerceUserAddressDTO } from "@/lib/addresses/coerce-user-address-dto";
import {
  formatCanonicalFullLineFromDto,
  resolveCanonicalChipLineFromDto,
} from "@/lib/addresses/canonical-address-display";
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

export function resolveNeighborhoodFromLifeLabel(snapshot: AddressDefaultsSnapshot | null): string | null {
  return snapshot?.neighborhoodFromLife?.label?.trim() || null;
}

function coerceDefaults(snapshot: AddressDefaultsSnapshot | null): UserAddressDefaultsDTO | null {
  if (!snapshot?.ok || !snapshot.defaults) return null;
  return {
    delivery: coerceUserAddressDTO(snapshot.defaults.delivery),
    master: coerceUserAddressDTO(snapshot.defaults.master),
    trade: coerceUserAddressDTO(snapshot.defaults.trade),
    life: coerceUserAddressDTO(snapshot.defaults.life),
  };
}

/** Philife·거래 탐색 헤더 — master SHORT 칩 → 생활 동네 요약 */
export function resolveExplorationAddressLineFromSnapshot(snapshot: AddressDefaultsSnapshot | null): string | null {
  const defaults = coerceDefaults(snapshot);
  if (!defaults) return null;
  const master = defaults.master;
  if (master?.id) {
    const chip = resolveCanonicalChipLineFromDto(master).trim();
    if (chip) return chip;
  }
  return resolveNeighborhoodFromLifeLabel(snapshot);
}

/** 내정보 — master FULL 한 줄만. 다른 기본지·생활 동네로 위장하지 않음. */
export function resolveRepresentativeFullAddressLineFromSnapshot(
  snapshot: AddressDefaultsSnapshot | null
): string | null {
  const defaults = coerceDefaults(snapshot);
  if (!defaults?.master?.id) return null;
  const masterLine = formatCanonicalFullLineFromDto(defaults.master).trim();
  if (!isPlainAddressPlaceholder(masterLine)) return masterLine;
  return null;
}

export function resolveAddressBookPresentationFromSnapshot(
  snapshot: AddressDefaultsSnapshot | null
): AddressBookCardPresentation | null {
  const defaults = coerceDefaults(snapshot);
  if (!defaults?.master?.id) return null;
  return formatAddressBookCardPresentation(defaults.master);
}

/** `/stores` 배달 홈 헤더 — routing pick + Baemin 줄 + 생활 동네 */
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
