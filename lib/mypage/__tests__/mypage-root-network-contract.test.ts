import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();

vi.stubGlobal("fetch", fetchMock);

describe("mypage root network contract", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.resetModules();
    delete (globalThis as { __SAMARKET_ADDRESS_DEFAULTS_CANONICAL__?: unknown })
      .__SAMARKET_ADDRESS_DEFAULTS_CANONICAL__;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("resolveMypageHomeProfileRow uses boot snapshot without network when present", async () => {
    vi.doMock("@/lib/app-boot/app-boot-store", () => ({
      peekAppBootProfile: () => ({
        id: "viewer-1",
        nickname: "A",
        display_name: "A",
      }),
    }));
    vi.doMock("@/lib/profile/fetch-me-profile-deduped", () => ({
      fetchMeProfileDeduped: vi.fn(async () => {
        throw new Error("must not network");
      }),
      isMeProfileFullFetchSkippable: () => false,
      peekMeProfileCached: () => null,
    }));

    const { resolveMypageHomeProfileRow } = await import("@/lib/mypage/resolve-mypage-home-profile");
    const row = await resolveMypageHomeProfileRow();
    expect(row?.id).toBe("viewer-1");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetchAddressDefaultsSnapshot parallel callers share one network GET", async () => {
    let inflight = 0;
    let maxInflight = 0;
    fetchMock.mockImplementation(async () => {
      inflight += 1;
      maxInflight = Math.max(maxInflight, inflight);
      await new Promise((r) => setTimeout(r, 30));
      inflight -= 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, defaults: { master: { id: "a" } } }),
      };
    });

    const mod = await import("@/lib/addresses/fetch-address-defaults-client");
    mod.invalidateAddressDefaultsSnapshotCache();
    await Promise.all([
      mod.fetchAddressDefaultsSnapshot({ caller: "mypage_home_model" }),
      mod.fetchAddressDefaultsSnapshot({ caller: "representative_address_line" }),
      mod.fetchAddressDefaultsSnapshot({ caller: "representative_address_presentation" }),
      mod.fetchAddressDefaultsSnapshot({ caller: "representative_full_address_line" }),
    ]);
    expect(maxInflight).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("force=true parallel callers still share one network GET", async () => {
    let inflight = 0;
    let maxInflight = 0;
    fetchMock.mockImplementation(async () => {
      inflight += 1;
      maxInflight = Math.max(maxInflight, inflight);
      await new Promise((r) => setTimeout(r, 40));
      inflight -= 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, defaults: { master: { id: "a" } } }),
      };
    });

    const mod = await import("@/lib/addresses/fetch-address-defaults-client");
    mod.invalidateAddressDefaultsSnapshotCache();
    await Promise.all([
      mod.fetchAddressDefaultsSnapshot({ force: true, caller: "mypage_home_model" }),
      mod.fetchAddressDefaultsSnapshot({ force: true, caller: "representative_address_line" }),
      mod.fetchAddressDefaultsSnapshot({ force: true, caller: "representative_address_presentation" }),
      mod.fetchAddressDefaultsSnapshot({ force: true, caller: "delivery_home_header_address" }),
    ]);
    expect(maxInflight).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("force=true joins active inflight and does not start a parallel GET", async () => {
    let starts = 0;
    fetchMock.mockImplementation(async () => {
      starts += 1;
      await new Promise((r) => setTimeout(r, 50));
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, defaults: { master: { id: "a" } } }),
      };
    });

    const mod = await import("@/lib/addresses/fetch-address-defaults-client");
    mod.invalidateAddressDefaultsSnapshotCache();
    const first = mod.fetchAddressDefaultsSnapshot({ caller: "mypage_home_model" });
    await new Promise((r) => setTimeout(r, 5));
    const forced = mod.fetchAddressDefaultsSnapshot({
      force: true,
      caller: "representative_address_line",
      reason: "force_addresses_updated",
    });
    await Promise.all([first, forced]);
    expect(starts).toBe(1);
  });

  it("MypageRequiredInfoSummary source does not import address presentation hook", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.join(process.cwd(), "components/mypage/home/MypageRequiredInfoSummary.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/useRepresentativeAddressPresentation/);
    expect(src).not.toMatch(/fetchAddressDefaultsSnapshot\s*\(/);
    expect(src).toMatch(/mypage-account-control-card/);
    expect(src).not.toMatch(/mypage-required-info-complete/);
    expect(src).not.toMatch(/stepIndex/);
  });

  it("owner-lite idle hydrate scheduled off mypage is cancelled on mypage cancel API", async () => {
    vi.stubGlobal("window", {
      location: { pathname: "/philife", href: "https://samarket.vercel.app/philife" },
      sessionStorage: {
        getItem: () => null,
        setItem: () => {},
      },
      document: { visibilityState: "visible" },
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    const idleCbs: Array<() => void> = [];
    vi.doMock("@/lib/ui/network-policy", () => ({
      isConstrainedNetwork: () => false,
      scheduleWhenBrowserIdle: (cb: () => void) => {
        idleCbs.push(cb);
        return idleCbs.length;
      },
      cancelScheduledWhenBrowserIdle: (id: number) => {
        idleCbs[id - 1] = () => {};
      },
    }));
    vi.doMock("@/lib/me/fetch-me-stores-deduped", () => ({
      fetchMeStoresListDeduped: vi.fn(async () => {
        throw new Error("stores network must not run");
      }),
      invalidateMeStoresListDedupedCache: () => {},
      seedMeStoresListClientCacheFromStores: () => {},
    }));
    vi.doMock("@/lib/auth/get-current-user", () => ({
      getCurrentUser: () => ({ id: "u1" }),
    }));

    const mod = await import("@/lib/stores/owner-lite-external-store");
    const unsub = mod.subscribeOwnerLiteStore(() => {});
    expect(idleCbs.length).toBe(1);
    (globalThis as { window: { location: { pathname: string } } }).window.location.pathname = "/mypage";
    mod.cancelPendingOwnerLiteAutoHydrate("test_mypage_enter");
    idleCbs[0]!();
    unsub();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
