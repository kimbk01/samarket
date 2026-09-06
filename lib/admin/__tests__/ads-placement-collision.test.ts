import { describe, expect, it } from "vitest";
import {
  detectPlacementCollisions,
  intervalsOverlap,
  isExposureOverlapCandidate,
} from "@/lib/admin/ads-collision/detect-placement-collisions";

describe("ads placement collision", () => {
  it("excludes paused/hidden from active overlap (G)", () => {
    expect(isExposureOverlapCandidate("ACTIVE")).toBe(true);
    expect(isExposureOverlapCandidate("SCHEDULED")).toBe(true);
    expect(isExposureOverlapCandidate("PAUSED")).toBe(false);
    expect(isExposureOverlapCandidate("HIDDEN")).toBe(false);
    expect(isExposureOverlapCandidate("ENDED")).toBe(false);
  });

  it("detects interval overlap", () => {
    expect(
      intervalsOverlap("2026-09-01T00:00:00Z", "2026-09-10T00:00:00Z", "2026-09-05T00:00:00Z", "2026-09-12T00:00:00Z")
    ).toBe(true);
    expect(
      intervalsOverlap("2026-09-01T00:00:00Z", "2026-09-05T00:00:00Z", "2026-09-06T00:00:00Z", "2026-09-12T00:00:00Z")
    ).toBe(false);
  });

  it("flags same store + same placement overlap as BLOCKING when capacity 1", () => {
    const findings = detectPlacementCollisions([
      {
        id: "c1",
        storeId: "s1",
        storeName: "Store A",
        inventoryKeys: ["STORES_HOME_HERO"],
        lifecycleStatus: "ACTIVE",
        startAt: "2026-09-01T00:00:00Z",
        endAt: "2026-09-10T00:00:00Z",
      },
      {
        id: "c2",
        storeId: "s1",
        storeName: "Store A",
        inventoryKeys: ["STORES_HOME_HERO"],
        lifecycleStatus: "SCHEDULED",
        startAt: "2026-09-05T00:00:00Z",
        endAt: "2026-09-15T00:00:00Z",
      },
    ]);
    expect(findings.some((f) => f.severity === "BLOCKING")).toBe(true);
    expect(findings.every((f) => f.severityLabelKo !== "BLOCKING")).toBe(true);
  });

  it("treats multi-placement same store as WARNING not auto-block", () => {
    const findings = detectPlacementCollisions([
      {
        id: "c1",
        storeId: "s1",
        storeName: "Store A",
        inventoryKeys: ["STORES_HOME_HERO"],
        lifecycleStatus: "ACTIVE",
        startAt: "2026-09-01T00:00:00Z",
        endAt: "2026-09-10T00:00:00Z",
      },
      {
        id: "c2",
        storeId: "s1",
        storeName: "Store A",
        inventoryKeys: ["STORES_HOME_FEED"],
        lifecycleStatus: "ACTIVE",
        startAt: "2026-09-01T00:00:00Z",
        endAt: "2026-09-10T00:00:00Z",
      },
    ]);
    const b = findings.find((f) => f.checkCode === "B_SAME_STORE_MULTI_PLACEMENT");
    expect(b?.severity).toBe("WARNING");
  });

  it("does not count paused campaign as active overlap peer", () => {
    const findings = detectPlacementCollisions([
      {
        id: "c1",
        storeId: "s1",
        storeName: "Store A",
        inventoryKeys: ["STORES_HOME_HERO"],
        lifecycleStatus: "ACTIVE",
        startAt: "2026-09-01T00:00:00Z",
        endAt: "2026-09-10T00:00:00Z",
      },
      {
        id: "c2",
        storeId: "s1",
        storeName: "Store A",
        inventoryKeys: ["STORES_HOME_HERO"],
        lifecycleStatus: "PAUSED",
        startAt: "2026-09-01T00:00:00Z",
        endAt: "2026-09-10T00:00:00Z",
      },
    ]);
    expect(findings.filter((f) => f.checkCode === "A_SAME_STORE_PLACEMENT_OVERLAP")).toHaveLength(0);
  });
});
