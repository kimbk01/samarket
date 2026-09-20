import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  TRADE_MARKETPLACE_GUEST_ALL_AFTER_AUTH_EXIT_KEY,
  consumeTradeMarketplaceGuestAllAfterAuthExit,
  isTradeMarketplaceGuestAllAfterAuthExitPending,
  isTradeMarketplaceMemberBrowseReseedPending,
  markTradeMarketplaceGuestAllAfterAuthExit,
  markTradeMarketplaceMemberBrowseReseed,
  resetTradeMarketplaceAuthTransitionBrowseForTests,
  shouldConsumeTradeMarketplaceGuestAllAfterAuthExit,
  simulateTradeMarketplaceAuthTransitionHardNavForTests,
} from "@/lib/trade/location/trade-marketplace-auth-transition-browse";
import {
  buildTradeLocationHref,
  parseTradeLocationScopeFromSearchParams,
} from "@/lib/trade/location/trade-location-scope";

const root = resolve(__dirname, "../../../..");

function read(rel: string): string {
  return readFileSync(resolve(root, rel), "utf8");
}

describe("ISSUE #1 — durable guest-all after auth-exit hard nav", () => {
  let session: Storage;

  beforeEach(() => {
    const map = new Map<string, string>();
    session = {
      get length() {
        return map.size;
      },
      clear: () => map.clear(),
      getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
      key: (index: number) => [...map.keys()][index] ?? null,
      removeItem: (key: string) => {
        map.delete(key);
      },
      setItem: (key: string, value: string) => {
        map.set(key, value);
      },
    };
    vi.stubGlobal("window", { sessionStorage: session });
    vi.stubGlobal("sessionStorage", session);
    resetTradeMarketplaceAuthTransitionBrowseForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("T1 — hard-nav boundary keeps durable guest reseed; CITY URL → ALL commit shape", () => {
    markTradeMarketplaceGuestAllAfterAuthExit();
    expect(sessionStorage.getItem(TRADE_MARKETPLACE_GUEST_ALL_AFTER_AUTH_EXIT_KEY)).toBe("1");

    simulateTradeMarketplaceAuthTransitionHardNavForTests();
    expect(isTradeMarketplaceGuestAllAfterAuthExitPending()).toBe(true);

    const citySp = new URLSearchParams("location=city&lgu=pasig&radius=10");
    expect(parseTradeLocationScopeFromSearchParams(citySp).mode).toBe("city");
    const allHref = buildTradeLocationHref("/market", citySp.toString(), { mode: "all" });
    const allSp = new URLSearchParams(allHref.split("?")[1] ?? "");
    expect(allSp.get("location")).toBe("all");
    expect(allSp.get("lgu")).toBeNull();
    expect(allSp.get("radius")).toBeNull();
    expect(shouldConsumeTradeMarketplaceGuestAllAfterAuthExit({ mode: "all" })).toBe(true);
  });

  it("T2 — ALL commit success → durable marker consumed", () => {
    markTradeMarketplaceGuestAllAfterAuthExit();
    simulateTradeMarketplaceAuthTransitionHardNavForTests();
    expect(isTradeMarketplaceGuestAllAfterAuthExitPending()).toBe(true);

    expect(shouldConsumeTradeMarketplaceGuestAllAfterAuthExit({ mode: "all" })).toBe(true);
    consumeTradeMarketplaceGuestAllAfterAuthExit();
    expect(isTradeMarketplaceGuestAllAfterAuthExitPending()).toBe(false);
    expect(sessionStorage.getItem(TRADE_MARKETPLACE_GUEST_ALL_AFTER_AUTH_EXIT_KEY)).toBeNull();
  });

  it("T3 — UNSET/recoverable → marker NOT consumed", () => {
    markTradeMarketplaceGuestAllAfterAuthExit();
    expect(shouldConsumeTradeMarketplaceGuestAllAfterAuthExit({ mode: "unset" })).toBe(false);
    expect(shouldConsumeTradeMarketplaceGuestAllAfterAuthExit({ mode: "city" })).toBe(false);
    expect(isTradeMarketplaceGuestAllAfterAuthExitPending()).toBe(true);
    expect(sessionStorage.getItem(TRADE_MARKETPLACE_GUEST_ALL_AFTER_AUTH_EXIT_KEY)).toBe("1");
  });

  it("T4 — after consume, guest manual CITY is preserved (no permanent guest=ALL)", () => {
    markTradeMarketplaceGuestAllAfterAuthExit();
    consumeTradeMarketplaceGuestAllAfterAuthExit();
    expect(isTradeMarketplaceGuestAllAfterAuthExitPending()).toBe(false);

    const citySp = new URLSearchParams("location=city&lgu=pasig&radius=5");
    const scope = parseTradeLocationScopeFromSearchParams(citySp);
    expect(scope.mode).toBe("city");
    if (scope.mode === "city") {
      expect(scope.canonicalId.length).toBeGreaterThan(0);
      expect(scope.radiusKm).toBe(5);
    }
  });

  it("T5 — A logout then B login: member reseed clears guest marker; CITY B wins", () => {
    markTradeMarketplaceGuestAllAfterAuthExit();
    simulateTradeMarketplaceAuthTransitionHardNavForTests();
    expect(isTradeMarketplaceGuestAllAfterAuthExitPending()).toBe(true);

    markTradeMarketplaceMemberBrowseReseed();
    expect(isTradeMarketplaceGuestAllAfterAuthExitPending()).toBe(false);
    expect(isTradeMarketplaceMemberBrowseReseedPending()).toBe(true);
    expect(sessionStorage.getItem(TRADE_MARKETPLACE_GUEST_ALL_AFTER_AUTH_EXIT_KEY)).toBeNull();

    const bCity = buildTradeLocationHref("/market", "location=city&lgu=makati", {
      mode: "city",
      lguId: "makati",
      canonicalId: "makati",
      radiusKm: null,
    });
    const sp = new URLSearchParams(bCity.split("?")[1] ?? "");
    expect(sp.get("location")).toBe("city");
    expect(sp.get("lgu")).toBeTruthy();
  });

  it("T6 — A logout then B login without master → member reseed path allows ALL", () => {
    markTradeMarketplaceGuestAllAfterAuthExit();
    markTradeMarketplaceMemberBrowseReseed();
    expect(isTradeMarketplaceGuestAllAfterAuthExitPending()).toBe(false);
    expect(isTradeMarketplaceMemberBrowseReseedPending()).toBe(true);
    expect(shouldConsumeTradeMarketplaceGuestAllAfterAuthExit({ mode: "all" })).toBe(true);
    const allHref = buildTradeLocationHref("/market", "location=city&lgu=pasig", { mode: "all" });
    expect(allHref).toContain("location=all");
    expect(allHref).not.toContain("lgu=");
  });

  it("T7 — stale lgu/radius removed when guest ALL committed", () => {
    const href = buildTradeLocationHref(
      "/market",
      "location=city&lgu=pasig&radius=10&category=x",
      { mode: "all" }
    );
    const sp = new URLSearchParams(href.split("?")[1] ?? "");
    expect(sp.get("location")).toBe("all");
    expect(sp.get("lgu")).toBeNull();
    expect(sp.get("radius")).toBeNull();
    expect(sp.get("category")).toBe("x");
  });

  it("T8 — guest direct CITY without auth-exit marker remains valid", () => {
    expect(isTradeMarketplaceGuestAllAfterAuthExitPending()).toBe(false);
    const scope = parseTradeLocationScopeFromSearchParams(
      new URLSearchParams("location=city&lgu=pasig")
    );
    expect(scope.mode).toBe("city");
  });

  it("wiring — wipe writes guest-all after sessionStorage clear; hydrate consumes only ALL", () => {
    const wipe = read("lib/auth/client-session-wipe.ts");
    const runWipeSlice = wipe.slice(wipe.indexOf("async function runWipeClientSessionState"));
    const clearIdx = runWipeSlice.indexOf("clearEphemeralSessionStorage");
    const markIdx = runWipeSlice.indexOf("markTradeMarketplaceGuestAllAfterAuthExit");
    expect(clearIdx).toBeGreaterThan(-1);
    expect(markIdx).toBeGreaterThan(clearIdx);

    const hydrate = read("lib/trade/location/use-trade-marketplace-location-hydrate.ts");
    expect(hydrate).toContain("shouldConsumeTradeMarketplaceGuestAllAfterAuthExit");
    expect(hydrate).toContain("!memberReseed && isTradeMarketplaceGuestAllAfterAuthExitPending");
  });
});
