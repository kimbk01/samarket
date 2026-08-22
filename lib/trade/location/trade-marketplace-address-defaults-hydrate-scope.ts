/**
 * Marketplace UNSET URL hydrate — address-defaults snapshot → scope before master lookup.
 *
 * CONTRACT / DO NOT regress: `docs/dibay-marketplace-trade-guest-location-hard-lock.md`
 * - address-defaults 401/403 + **confirmed guest** → ALL (same as ok + no master)
 * - 401/403 while boot/session may still restore → UNSET (retry; not nationwide leak)
 * - null or other !ok → UNSET
 * - ok → null (caller resolves master → CITY or ALL)
 *
 * Guest confirmation mirrors stores `canOpenPublicRootFeedBeforeBootReady` discipline (CUT-B1).
 */
import type { AddressDefaultsSnapshot } from "@/lib/addresses/address-defaults-snapshot";
import { getAppBootSnapshot, isAppBootReady } from "@/lib/app-boot/app-boot-store";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  isRecoverableGuestAuthEstablished,
  isTerminalGuestAuthEstablished,
} from "@/lib/auth/guest-auth-state";
import type { TradeLocationScope } from "@/lib/trade/location/trade-location-scope";

/** address-defaults auth failure is not guest proof during recoverable boot / cached session. */
export function canCommitTradeGuestNationwideAllFromAddressDefaults(
  _snapshot: AddressDefaultsSnapshot
): boolean {
  if (isRecoverableGuestAuthEstablished()) return false;
  if (getCurrentUser()?.id?.trim()) return false;

  const boot = getAppBootSnapshot();
  if (boot.status === "anonymous") return true;
  if (isTerminalGuestAuthEstablished()) return true;

  /** Boot unsettled — session may still restore (logged-in cold entry). */
  if (!isAppBootReady()) return false;

  /** Boot ready without profile — anonymous path only. */
  if (!boot.profile) return true;

  return false;
}

export function tradeMarketplaceHydrateScopeBeforeMasterResolution(
  snapshot: AddressDefaultsSnapshot | null
): TradeLocationScope | null {
  if (snapshot?.ok) return null;
  if (snapshot && (snapshot.status === 401 || snapshot.status === 403)) {
    return canCommitTradeGuestNationwideAllFromAddressDefaults(snapshot)
      ? { mode: "all" }
      : { mode: "unset" };
  }
  return { mode: "unset" };
}
