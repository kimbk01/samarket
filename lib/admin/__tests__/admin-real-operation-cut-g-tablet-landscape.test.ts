import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ADMIN_REAL_OPERATION_CUT_G_LOCKED,
  CUT_G_CARRY,
  TABLET_LANDSCAPE_VIEWPORT_AUTHORITY,
  assertAdminRealOperationCutGTabletLandscapeHardLock,
} from "@/lib/admin/admin-real-operation-cut-g-tablet-landscape-hard-lock";

describe("CUT G Tablet Landscape hard lock", () => {
  it("locks viewport authority + carry", () => {
    expect(ADMIN_REAL_OPERATION_CUT_G_LOCKED).toBe(true);
    expect(assertAdminRealOperationCutGTabletLandscapeHardLock()).toBe(true);
    expect(TABLET_LANDSCAPE_VIEWPORT_AUTHORITY.width).toBe(1024);
    expect(TABLET_LANDSCAPE_VIEWPORT_AUTHORITY.height).toBe(768);
    expect(TABLET_LANDSCAPE_VIEWPORT_AUTHORITY.codeReadyIsNotPass).toBe(true);
    expect(CUT_G_CARRY.cutFPlacementMapActiveEligibility).toBe("DEFERRED_TO_CUT_I");
    expect(CUT_G_CARRY.financeProductionE2E).toBe("NOT_PROVEN");
  });

  it("requires runtime evidence artifact (not CSS-class PASS)", () => {
    const reportPath = join(
      process.cwd(),
      "docs/perf/admin-cut-g-tablet-landscape-runtime/cut-g-report.json"
    );
    expect(existsSync(reportPath)).toBe(true);
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    expect(report.cut).toBe("CUT_G_TABLET_LANDSCAPE_RUNTIME_CLOSE");
    expect(report.viewportAuthority.tabletLandscape.width).toBe(1024);
    expect(report.productionClaimForbidden).toBe(true);
    expect(report.routes?.T1_SHELL_ACTION_CENTER?.geometry?.pageOverflowX).toBe(false);
    expect(report.carry?.CUT_F_P1_PLACEMENT_MAP_ACTIVE_ELIGIBILITY).toBe("DEFERRED_TO_CUT_I");
  });
});
