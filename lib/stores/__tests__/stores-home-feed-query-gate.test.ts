import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  resolveStoresHomeFeedQueryGate,
  storeHomeFeedRegionOnlySuffix,
} from "@/lib/stores/stores-home-feed-query-gate";

const boot = vi.hoisted(() => ({
  ready: false,
  status: "idle" as "idle" | "ready" | "anonymous",
  profile: null as null | Record<string, unknown>,
}));

vi.mock("@/lib/app-boot/app-boot-store", () => ({
  isAppBootReady: () => boot.ready,
  getAppBootSnapshot: () => ({ status: boot.status, profile: boot.profile, bootedAt: null, error: null }),
  peekAppBootProfile: () => boot.profile,
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
  getRegionName: () => "Manila",
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
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("is not ready before boot when primaryRegion is missing", () => {
    expect(resolveStoresHomeFeedQueryGate(null)).toEqual({ ready: false, querySuffix: "" });
  });

  it("uses primaryRegion before boot so cold is not blocked", () => {
    expect(resolveStoresHomeFeedQueryGate(sampleRegion)).toEqual({
      ready: true,
      querySuffix: "?region=Manila",
    });
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

  it("authenticated with no location uses root once", () => {
    boot.ready = true;
    boot.status = "ready";
    boot.profile = null;
    expect(resolveStoresHomeFeedQueryGate(null)).toEqual({ ready: true, querySuffix: "" });
  });
});
