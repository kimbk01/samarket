import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  canOpenPublicRootFeedBeforeBootReady,
  resolveStoresHomeFeedQueryGate,
  storeHomeFeedRegionOnlySuffix,
} from "@/lib/stores/stores-home-feed-query-gate";

const boot = vi.hoisted(() => ({
  ready: false,
  status: "idle" as "idle" | "ready" | "anonymous" | "hydrating",
  profile: null as null | Record<string, unknown>,
}));

const profileLite = vi.hoisted(() => ({
  cached: null as null | { status: number; json: unknown },
  guestSkip: false,
}));

const guestAuth = vi.hoisted(() => ({
  recoverable: false,
}));

vi.mock("@/lib/app-boot/app-boot-store", () => ({
  isAppBootReady: () => boot.ready,
  getAppBootSnapshot: () => ({ status: boot.status, profile: boot.profile, bootedAt: null, error: null }),
  peekAppBootProfile: () => boot.profile,
}));

vi.mock("@/lib/app-boot/fetch-app-boot-profile", () => ({
  peekAppBootProfileFetchCached: () => profileLite.cached,
  isAppBootProfileFetchGuestSkipCached: () => profileLite.guestSkip,
}));

vi.mock("@/lib/auth/guest-auth-state", () => ({
  isRecoverableGuestAuthEstablished: () => guestAuth.recoverable,
}));

vi.mock("@/lib/regions/profile-to-user-region", () => ({
  userRegionFromProfileSlice: (p: { region_code?: string | null; address_detail?: string | null }) => {
    if (!p.region_code) return null;
    return {
      id: "profile-location",
      userId: "u1",
      regionId: "ncr",
      cityId: "manila",
      barangay: (p.address_detail ?? "").trim(),
      label: "Manila",
      isPrimary: true,
      createdAt: "",
    };
  },
}));

vi.mock("@/lib/regions/region-utils", () => ({
  getRegionName: (id: string) => (id === "cebu" ? "Cebu" : "Manila"),
}));

const addressDefaults = vi.hoisted(() => ({
  peek: null as null | { ok: boolean; status: number; defaults: { master?: unknown } | null; neighborhoodFromLife: null },
}));

vi.mock("@/lib/addresses/fetch-address-defaults-client", () => ({
  peekFreshAddressDefaultsSnapshot: () => addressDefaults.peek,
}));

vi.mock("@/lib/auth/get-current-user", () => ({
  getCurrentUser: () => ({ id: "u1" }),
}));

const sampleRegion = {
  id: "mock",
  userId: "u1",
  regionId: "ncr",
  cityId: "manila",
  barangay: "1234",
  label: "x",
  isPrimary: true,
  createdAt: "",
};

describe("storeHomeFeedRegionOnlySuffix", () => {
  it("omits district even when barangay is set", () => {
    expect(storeHomeFeedRegionOnlySuffix(sampleRegion)).toBe("?region=Manila");
  });
});

describe("resolveStoresHomeFeedQueryGate", () => {
  beforeEach(() => {
    boot.ready = false;
    boot.status = "idle";
    boot.profile = null;
    profileLite.cached = null;
    profileLite.guestSkip = false;
    guestAuth.recoverable = false;
    addressDefaults.peek = null;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("is not ready before boot when primaryRegion and profile-lite are missing", () => {
    expect(resolveStoresHomeFeedQueryGate(null)).toEqual({ ready: false, querySuffix: "" });
  });

  it("uses primaryRegion before boot so cold is not blocked", () => {
    expect(resolveStoresHomeFeedQueryGate(sampleRegion)).toEqual({
      ready: true,
      querySuffix: "?region=Manila",
    });
  });

  it("CUT-B1: network profile-lite 401 opens public root while boot hydrating", () => {
    boot.status = "hydrating";
    profileLite.cached = { status: 401, json: { ok: false, authenticated: false } };
    profileLite.guestSkip = false;
    guestAuth.recoverable = false;
    expect(canOpenPublicRootFeedBeforeBootReady()).toBe(true);
    expect(resolveStoresHomeFeedQueryGate(null)).toEqual({ ready: true, querySuffix: "" });
    expect(boot.ready).toBe(false);
  });

  it("CUT-B1: recoverable guest blocks early root (auth restore race)", () => {
    boot.status = "hydrating";
    profileLite.cached = { status: 401, json: { ok: false, authenticated: false } };
    guestAuth.recoverable = true;
    expect(canOpenPublicRootFeedBeforeBootReady()).toBe(false);
    expect(resolveStoresHomeFeedQueryGate(null)).toEqual({ ready: false, querySuffix: "" });
  });

  it("CUT-B1: guest-skip synthetic 401 does not open early root", () => {
    boot.status = "hydrating";
    profileLite.cached = { status: 401, json: { ok: false, authenticated: false } };
    profileLite.guestSkip = true;
    guestAuth.recoverable = false;
    expect(canOpenPublicRootFeedBeforeBootReady()).toBe(false);
    expect(resolveStoresHomeFeedQueryGate(null)).toEqual({ ready: false, querySuffix: "" });
  });

  it("CUT-B: profile-lite 200 with region opens region feed before boot ready", () => {
    boot.status = "hydrating";
    profileLite.cached = {
      status: 200,
      json: {
        ok: true,
        profile: { region_code: "ncr:manila", region_name: "Manila", address_detail: "x" },
      },
    };
    expect(resolveStoresHomeFeedQueryGate(null)).toEqual({
      ready: true,
      querySuffix: "?region=Manila",
    });
  });

  it("CUT-B: profile-lite 200 without region does not early-open (avoid root-then-region fan-out)", () => {
    boot.status = "hydrating";
    profileLite.cached = {
      status: 200,
      json: { ok: true, profile: { id: "u1", nickname: "n" } },
    };
    expect(resolveStoresHomeFeedQueryGate(null)).toEqual({ ready: false, querySuffix: "" });
  });

  it("anonymous boot uses root suffix once", () => {
    boot.ready = true;
    boot.status = "anonymous";
    expect(resolveStoresHomeFeedQueryGate(null)).toEqual({ ready: true, querySuffix: "" });
  });

  it("prefers boot profile region and ignores district in key", () => {
    boot.ready = true;
    boot.status = "ready";
    boot.profile = {
      region_code: "ncr:manila",
      region_name: "Manila",
      address_detail: "1234",
    };
    expect(resolveStoresHomeFeedQueryGate(null)).toEqual({
      ready: true,
      querySuffix: "?region=Manila",
    });
  });

  it("ADDR-SSOT-002: master-sourced primaryRegion wins over stale boot profile", () => {
    boot.ready = true;
    boot.status = "ready";
    boot.profile = { region_code: "ncr:manila", region_name: "Manila" };
    const masterRegion = { ...sampleRegion, id: "master-address", regionId: "cebu", cityId: "c1", barangay: "" };
    expect(resolveStoresHomeFeedQueryGate(masterRegion)).toEqual({
      ready: true,
      querySuffix: "?region=Cebu",
    });
  });

  it("ADDR-SSOT-002: fresh master snapshot peek wins over boot profile", () => {
    boot.ready = true;
    boot.status = "ready";
    boot.profile = { region_code: "ncr:manila", region_name: "Manila" };
    addressDefaults.peek = {
      ok: true,
      status: 200,
      defaults: { master: { appRegionId: "cebu", appCityId: "c1", fullAddress: "Lahug, Cebu" } },
      neighborhoodFromLife: null,
    };
    expect(resolveStoresHomeFeedQueryGate(null)).toEqual({ ready: true, querySuffix: "?region=Cebu" });
  });

  it("ADDR-SSOT-002: resolved no-master ignores profile fallback (root)", () => {
    boot.ready = true;
    boot.status = "ready";
    boot.profile = { region_code: "ncr:manila", region_name: "Manila" };
    addressDefaults.peek = { ok: true, status: 200, defaults: { master: null }, neighborhoodFromLife: null };
    const profileFallback = { ...sampleRegion, id: "profile-location", barangay: "" };
    expect(resolveStoresHomeFeedQueryGate(profileFallback)).toEqual({ ready: true, querySuffix: "" });
  });

  it("authenticated with no location uses root once", () => {
    boot.ready = true;
    boot.status = "ready";
    boot.profile = null;
    expect(resolveStoresHomeFeedQueryGate(null)).toEqual({ ready: true, querySuffix: "" });
  });
});
