import { beforeEach, describe, expect, it } from "vitest";
import type { AddressDefaultsSnapshot } from "@/lib/addresses/address-defaults-snapshot";
import { resetAppBootStore, setAppBootAnonymous } from "@/lib/app-boot/app-boot-store";
import {
  establishGuestAuthState,
  establishRecoverableGuestAuthState,
  resetGuestAuthStateForTests,
} from "@/lib/auth/guest-auth-state";
import {
  canCommitTradeGuestNationwideAllFromAddressDefaults,
  tradeMarketplaceHydrateScopeBeforeMasterResolution,
} from "@/lib/trade/location/trade-marketplace-address-defaults-hydrate-scope";

function snapshot(partial: Partial<AddressDefaultsSnapshot>): AddressDefaultsSnapshot {
  return {
    ok: partial.ok ?? false,
    status: partial.status ?? 500,
    defaults: partial.defaults ?? null,
    neighborhoodFromLife: partial.neighborhoodFromLife ?? null,
  };
}

describe("tradeMarketplaceHydrateScopeBeforeMasterResolution", () => {
  beforeEach(() => {
    resetAppBootStore();
    resetGuestAuthStateForTests();
  });

  it("GUEST-1 — raw 401 without guest proof → UNSET (not blind ALL)", () => {
    expect(
      tradeMarketplaceHydrateScopeBeforeMasterResolution(
        snapshot({ ok: false, status: 401, defaults: null })
      )
    ).toEqual({ mode: "unset" });
  });

  it("GUEST-2 — 401 + anonymous boot → ALL", () => {
    setAppBootAnonymous();
    expect(
      tradeMarketplaceHydrateScopeBeforeMasterResolution(
        snapshot({ ok: false, status: 401, defaults: null })
      )
    ).toEqual({ mode: "all" });
  });

  it("GUEST-2b — 403 + terminal guest → ALL", () => {
    establishGuestAuthState("test_terminal_guest");
    expect(
      tradeMarketplaceHydrateScopeBeforeMasterResolution(
        snapshot({ ok: false, status: 403, defaults: null })
      )
    ).toEqual({ mode: "all" });
  });

  it("GUEST-3 — recoverable guest 401 → UNSET (session may restore)", () => {
    establishRecoverableGuestAuthState("401:address-defaults");
    expect(
      canCommitTradeGuestNationwideAllFromAddressDefaults(
        snapshot({ ok: false, status: 401, defaults: null })
      )
    ).toBe(false);
    expect(
      tradeMarketplaceHydrateScopeBeforeMasterResolution(
        snapshot({ ok: false, status: 401, defaults: null })
      )
    ).toEqual({ mode: "unset" });
  });

  it("keeps ok snapshot for master resolution", () => {
    expect(
      tradeMarketplaceHydrateScopeBeforeMasterResolution(
        snapshot({ ok: true, status: 200, defaults: { master: null } })
      )
    ).toBeNull();
  });

  it("null snapshot → UNSET (transient fetch failure)", () => {
    expect(tradeMarketplaceHydrateScopeBeforeMasterResolution(null)).toEqual({ mode: "unset" });
  });

  it("500 / network-shaped !ok → UNSET (not ALL)", () => {
    expect(
      tradeMarketplaceHydrateScopeBeforeMasterResolution(
        snapshot({ ok: false, status: 500, defaults: null })
      )
    ).toEqual({ mode: "unset" });
  });
});
