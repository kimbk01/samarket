// @vitest-environment jsdom
/**
 * Owner SSOT (2026-10-16) — guest / no master address → `location=all` (nationwide latest);
 * address API error / timeout ≠ "no address": bounded retry, then error + retry UI.
 * Never endless loading, never a fake ALL, never a forced city.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const nav = vi.hoisted(() => ({
  search: "",
  /** Next keeps `useSearchParams()` identity stable per URL — mirror that. */
  cache: new Map<string, URLSearchParams>(),
  router: null as unknown as { replace: unknown; push: () => void; prefetch: () => void },
  replace: vi.fn((href: string) => {
    nav.search = href.includes("?") ? href.split("?")[1] : "";
  }),
}));

nav.router = { replace: nav.replace, push: () => {}, prefetch: () => {} };

vi.mock("next/navigation", () => ({
  usePathname: () => "/market",
  useSearchParams: () => {
    let sp = nav.cache.get(nav.search);
    if (!sp) {
      sp = new URLSearchParams(nav.search);
      nav.cache.set(nav.search, sp);
    }
    return sp;
  },
  /** Next's router instance is stable across renders. */
  useRouter: () => nav.router,
}));

vi.spyOn(console, "info").mockImplementation(() => {});
vi.spyOn(console, "log").mockImplementation(() => {});

import { resetAppBootStore, setAppBootAnonymous } from "@/lib/app-boot/app-boot-store";
import { resetGuestAuthStateForTests, establishRecoverableGuestAuthState } from "@/lib/auth/guest-auth-state";
import { invalidateAddressDefaultsSnapshotCache } from "@/lib/addresses/fetch-address-defaults-client";
import { resolveTradeMarketplaceMasterHydrateOutcome } from "@/lib/trade/location/resolve-trade-marketplace-default-city";
import {
  TRADE_MARKETPLACE_HYDRATE_RETRY_DELAYS_MS,
  useTradeMarketplaceLocationHydrate,
} from "@/lib/trade/location/use-trade-marketplace-location-hydrate";

type Responder = (url: string) => Response | Promise<Response>;
let responder: Responder;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const MASTER_UNMAPPABLE = {
  id: "addr-1",
  is_default_master: true,
  country: "PH",
  city_municipality: "Nowhere Town",
  province: "Atlantis",
};

beforeEach(() => {
  resetAppBootStore();
  resetGuestAuthStateForTests();
  invalidateAddressDefaultsSnapshotCache();
  try {
    sessionStorage.clear();
  } catch {
    /* ignore */
  }
  nav.search = "";
  nav.replace.mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      return responder(url);
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("resolveTradeMarketplaceMasterHydrateOutcome", () => {
  it("confirmed guest (anonymous boot) + 401 → resolved ALL", async () => {
    setAppBootAnonymous();
    responder = () => json(401, { ok: false, error: "login_required" });
    expect(await resolveTradeMarketplaceMasterHydrateOutcome()).toEqual({
      kind: "resolved",
      scope: { mode: "all" },
    });
  });

  it("401 while auth may still restore → pending_auth (not ALL, not error)", async () => {
    establishRecoverableGuestAuthState("test:boot-race");
    responder = () => json(401, { ok: false });
    expect((await resolveTradeMarketplaceMasterHydrateOutcome()).kind).toBe("pending_auth");
  });

  it("member without master address → resolved ALL", async () => {
    responder = () => json(200, { ok: true, defaults: { master: null } });
    expect(await resolveTradeMarketplaceMasterHydrateOutcome()).toEqual({
      kind: "resolved",
      scope: { mode: "all" },
    });
  });

  it("master that does not map to a City (national-lgu unresolved) → resolved ALL", async () => {
    responder = (url) =>
      url.includes("/api/me/address-defaults")
        ? json(200, { ok: true, defaults: { master: MASTER_UNMAPPABLE } })
        : json(200, { resolution: { status: "not_found" } });
    expect(await resolveTradeMarketplaceMasterHydrateOutcome()).toEqual({
      kind: "resolved",
      scope: { mode: "all" },
    });
  });

  it("address API 500 → transient_error (not disguised as 'no address')", async () => {
    responder = () => json(500, { ok: false });
    expect(await resolveTradeMarketplaceMasterHydrateOutcome()).toEqual({
      kind: "transient_error",
      status: 500,
    });
  });

  it("network failure / timeout → transient_error", async () => {
    responder = () => {
      throw new TypeError("network down");
    };
    expect((await resolveTradeMarketplaceMasterHydrateOutcome()).kind).toBe("transient_error");
  });

  it("national-lgu 503 while mapping master → transient_error (not fake ALL)", async () => {
    responder = (url) =>
      url.includes("/api/me/address-defaults")
        ? json(200, { ok: true, defaults: { master: MASTER_UNMAPPABLE } })
        : json(503, {});
    expect((await resolveTradeMarketplaceMasterHydrateOutcome()).kind).toBe("transient_error");
  });
});

describe("useTradeMarketplaceLocationHydrate — UNSET recovery", () => {
  let container: HTMLDivElement;
  let root: Root;
  const probe: { current: ReturnType<typeof useTradeMarketplaceLocationHydrate> | null } = {
    current: null,
  };
  let latest: ReturnType<typeof useTradeMarketplaceLocationHydrate> | null = null;

  function Harness() {
    const state = useTradeMarketplaceLocationHydrate();
    useEffect(() => {
      probe.current = state;
    });
    return null;
  }

  async function flush() {
    for (let i = 0; i < 8; i++) {
      await act(async () => {
        await Promise.resolve();
      });
    }
    sync();
  }

  async function rerender() {
    await act(async () => {
      root.render(createElement(Harness));
    });
    await flush();
  }

  /** Read the last committed hook state. */
  function sync() {
    latest = probe.current;
  }

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    latest = null;
    probe.current = null;
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("guest (boot anonymous) on /market without location → commits location=all", async () => {
    setAppBootAnonymous();
    responder = () => json(401, { ok: false });
    await rerender();
    expect(nav.replace).toHaveBeenCalledWith("/market?location=all", { scroll: false });
  });

  it("member without master → commits location=all", async () => {
    responder = () => json(200, { ok: true, defaults: { master: null } });
    await rerender();
    expect(nav.replace).toHaveBeenCalledWith("/market?location=all", { scroll: false });
  });

  it("address API keeps failing → bounded retries, then failed (no endless loading, no URL write)", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let calls = 0;
    responder = (url) => {
      if (url.includes("/api/me/address-defaults")) calls++;
      return json(500, { ok: false });
    };
    await rerender();
    expect(latest!.failed).toBe(false);
    expect(latest!.unresolved).toBe(true);
    for (const ms of TRADE_MARKETPLACE_HYDRATE_RETRY_DELAYS_MS) {
      await act(async () => {
        vi.advanceTimersByTime(ms);
      });
      await flush();
    }
    await flush();
    expect(calls).toBe(1 + TRADE_MARKETPLACE_HYDRATE_RETRY_DELAYS_MS.length);
    expect(latest!.failed).toBe(true);
    expect(latest!.unresolved).toBe(false);
    expect(nav.replace).not.toHaveBeenCalled();

    // user taps retry after the API recovers → resolves normally
    responder = () => json(200, { ok: true, defaults: { master: null } });
    await act(async () => {
      latest!.retry();
    });
    await flush();
    expect(nav.replace).toHaveBeenCalledWith("/market?location=all", { scroll: false });
  });

  it("transient failure then recovery on an automatic retry → resolves without user action", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let n = 0;
    responder = (url) => {
      if (!url.includes("/api/me/address-defaults")) return json(404, {});
      n++;
      return n === 1 ? json(503, { ok: false }) : json(200, { ok: true, defaults: { master: null } });
    };
    await rerender();
    expect(nav.replace).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(TRADE_MARKETPLACE_HYDRATE_RETRY_DELAYS_MS[0]);
    });
    await flush();
    expect(nav.replace).toHaveBeenCalledWith("/market?location=all", { scroll: false });
    expect(latest!.failed).toBe(false);
  });

  it("auth still restoring after boot settled (no further boot event) → timed retries, resolves when guest is confirmed", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    establishRecoverableGuestAuthState("test:unexpected-signed-out");
    setAppBootAnonymous();
    responder = () => json(401, { ok: false });
    await rerender();
    expect(nav.replace).not.toHaveBeenCalled();
    expect(latest!.unresolved).toBe(true);
    // session manager converges to terminal guest
    resetGuestAuthStateForTests();
    await act(async () => {
      vi.advanceTimersByTime(TRADE_MARKETPLACE_HYDRATE_RETRY_DELAYS_MS[0]);
    });
    await flush();
    expect(nav.replace).toHaveBeenCalledWith("/market?location=all", { scroll: false });
  });
});
