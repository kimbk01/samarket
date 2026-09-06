import { describe, expect, it } from "vitest";
import {
  getOwnerBottomNavOccupiesClearance,
  setOwnerBottomNavOccupiesClearance,
  subscribeOwnerBottomNavOccupiesClearance,
} from "@/lib/business/owner-bottom-nav-occupancy";
import { OWNER_FAB_BOTTOM_OFFSET_CLASS } from "@/lib/business/owner-shell-geometry";
import { OWNER_OVERLAY_Z } from "@/lib/business/owner-overlay-layers";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..");

describe("owner shell geometry / FAB clearance", () => {
  it("occupancy bridge toggles and notifies", () => {
    setOwnerBottomNavOccupiesClearance(false);
    expect(getOwnerBottomNavOccupiesClearance()).toBe(false);
    let hits = 0;
    const unsub = subscribeOwnerBottomNavOccupiesClearance(() => {
      hits += 1;
    });
    setOwnerBottomNavOccupiesClearance(true);
    expect(getOwnerBottomNavOccupiesClearance()).toBe(true);
    expect(hits).toBe(1);
    setOwnerBottomNavOccupiesClearance(true);
    expect(hits).toBe(1);
    setOwnerBottomNavOccupiesClearance(false);
    expect(hits).toBe(2);
    unsub();
  });

  it("FAB offset class consumes owner-fab-bottom token", () => {
    expect(OWNER_FAB_BOTTOM_OFFSET_CLASS).toContain("--owner-fab-bottom");
  });

  it("overlay semantic order places FAB below drawer/modal", () => {
    expect(OWNER_OVERLAY_Z.fab).toBeLessThan(OWNER_OVERLAY_Z.backdrop);
    expect(OWNER_OVERLAY_Z.backdrop).toBeLessThan(OWNER_OVERLAY_Z.drawer);
    expect(OWNER_OVERLAY_Z.drawer).toBeLessThan(OWNER_OVERLAY_Z.modal);
  });

  it("SupportFabHost prefers owner shell geometry/z (not main FAB sector)", () => {
    const src = readFileSync(
      join(ROOT, "components/support/SupportFabHost.tsx"),
      "utf8"
    );
    expect(src).toContain("getOwnerCompactShellBodyFlag");
    expect(src).toContain("getOwnerOpsDrawerOpen");
    expect(src).toContain("OWNER_FAB_BOTTOM_OFFSET_CLASS");
    expect(src).toContain("OWNER_OVERLAY_Z_CLASS.fab");
  });

  it("owner-compact-shell content-bottom and FAB share nav footprint incl. overhang", () => {
    const css = readFileSync(join(ROOT, "app/owner-compact-shell.css"), "utf8");
    expect(css).toContain("--owner-fab-bottom");
    expect(css).toContain("--owner-content-bottom");
    expect(css).toContain("--owner-bottom-nav-height");
    expect(css).toContain("--owner-bottom-nav-footprint");
    expect(css).toMatch(/--owner-bottom-nav-footprint:[^;]*delivery-home-overhang/);
    expect(css).toMatch(/--owner-content-bottom:[^;]*owner-bottom-nav-footprint/);
    expect(css).toMatch(/--owner-fab-bottom:[^;]*owner-bottom-nav-footprint/);
  });
});
