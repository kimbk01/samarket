import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { UserRegion } from "@/lib/regions/types";
import {
  neighborhoodLocationKeyFromRegion,
  neighborhoodLocationMetaFromRegion,
  normalizeNeighborhoodLocationKeyToCity,
} from "@/lib/neighborhood/location-key";
import { coalesceNeighborhoodLocationInput } from "@/lib/neighborhood/coalesce-location-input";

/** profiles.address_detail 이 barangay 로 들어온 RegionContext 형태 */
const regionWithPrivateDetail: UserRegion = {
  id: "profile-location",
  userId: "user-1",
  regionId: "ncr",
  cityId: "manila",
  barangay: "Unit 5B Tower 2",
  label: "Unit 5B Tower 2",
  isPrimary: true,
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("ADDR-PRIV-001/002 neighborhood location is City-only", () => {
  it("location key never embeds barangay / detail", () => {
    expect(neighborhoodLocationKeyFromRegion(regionWithPrivateDetail)).toBe("ncr:manila:");
  });

  it("location meta district is always empty", () => {
    const meta = neighborhoodLocationMetaFromRegion(regionWithPrivateDetail);
    expect(meta).not.toBeNull();
    expect(meta?.district).toBe("");
  });

  it("server normalizes legacy 3-segment keys to City key", () => {
    expect(normalizeNeighborhoodLocationKeyToCity("ncr:manila:Unit 5B Tower 2")).toBe("ncr:manila:");
    expect(normalizeNeighborhoodLocationKeyToCity("ncr:manila:")).toBe("ncr:manila:");
  });

  it("coalesced locations input drops client district and key detail", () => {
    const input = coalesceNeighborhoodLocationInput("ncr:manila:Unit 5B", {
      city: "Metro Manila",
      district: "Unit 5B",
      name: "Manila",
    });
    expect(input.district).toBe("");
  });

  it("Philife write form does not use RegionContext (profiles) as location authority", () => {
    const src = readFileSync(join(process.cwd(), "components/philife/PhilifeNeighborhoodWriteForm.tsx"), "utf8");
    expect(src).toContain("useCommunityLocalFilter");
    expect(src).not.toContain("useRegion");
    expect(src).not.toContain("currentRegion");
  });

  it("ADDR-PRIV-003 meeting region_text is sanitized to a public City label on the server", () => {
    const src = readFileSync(join(process.cwd(), "app/api/community/neighborhood-posts/route.ts"), "utf8");
    expect(src).toMatch(/sanitizePublicRegionLabel\(meet\.region_text\)/);
  });
});
