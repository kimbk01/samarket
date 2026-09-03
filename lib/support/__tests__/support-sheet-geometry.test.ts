import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  resolveSupportSheetGeometry,
  SUPPORT_SHEET_HEIGHT_RATIO,
} from "@/lib/support/support-sheet-geometry";

const ROOT = join(__dirname, "..", "..", "..");

describe("support sheet geometry — C5 CUSTOMER_VIEWPORT", () => {
  it("G1 keyboard closed offsetTop=0 → normal sheet", () => {
    const g = resolveSupportSheetGeometry({
      visualViewportHeight: 753,
      visualViewportOffsetTop: 0,
      layoutHeight: 753,
    });
    expect(g.bandKnown).toBe(true);
    expect(g.applyStageBand).toBe(false);
    expect(g.stageTopPx).toBe(0);
    expect(g.sheetHeightPx).toBe(Math.round(753 * SUPPORT_SHEET_HEIGHT_RATIO));
    expect(g.appliesOffsetTopToStage).toBe(false);
  });

  it("G2 keyboard open + offsetTop>0 → no VV stage band (header stays layout-anchored)", () => {
    const g = resolveSupportSheetGeometry({
      visualViewportHeight: 587,
      visualViewportOffsetTop: 179,
      layoutHeight: 753,
    });
    expect(g.applyStageBand).toBe(false);
    expect(g.stageTopPx).toBe(0);
    expect(g.sheetHeightPx).toBe(Math.round(587 * SUPPORT_SHEET_HEIGHT_RATIO));
    expect(g.appliesOffsetTopToStage).toBe(false);
  });

  it("G3 offsetTop change is not double-counted", () => {
    const closed = resolveSupportSheetGeometry({
      visualViewportHeight: 753,
      visualViewportOffsetTop: 0,
      layoutHeight: 753,
    });
    const open = resolveSupportSheetGeometry({
      visualViewportHeight: 587,
      visualViewportOffsetTop: 179,
      layoutHeight: 753,
    });
    expect(closed.applyStageBand).toBe(false);
    expect(open.applyStageBand).toBe(false);
    expect(closed.stageTopPx).toBe(0);
    expect(open.stageTopPx).toBe(0);
  });

  it("G4 content height shrinks when keyboard opens", () => {
    const closed = resolveSupportSheetGeometry({
      visualViewportHeight: 753,
      visualViewportOffsetTop: 0,
      layoutHeight: 753,
    });
    const open = resolveSupportSheetGeometry({
      visualViewportHeight: 587,
      visualViewportOffsetTop: 179,
      layoutHeight: 753,
    });
    expect(open.sheetHeightPx).toBeLessThan(closed.sheetHeightPx);
  });

  it("G5 sheet height stays within usable vv band", () => {
    const g = resolveSupportSheetGeometry({
      visualViewportHeight: 587,
      visualViewportOffsetTop: 179,
      layoutHeight: 753,
    });
    expect(g.sheetHeightPx).toBeLessThanOrEqual(587);
    expect(g.sheetHeightPx / 587).toBeCloseTo(SUPPORT_SHEET_HEIGHT_RATIO, 2);
  });

  it("G6 no hardcoded device keyboard height", () => {
    const geo = readFileSync(join(ROOT, "lib/support/support-sheet-geometry.ts"), "utf8");
    const shell = readFileSync(join(ROOT, "components/support/SupportSheetShell.tsx"), "utf8");
    expect(geo).not.toMatch(/keyboardHeight|iPhone14|336px|290px/);
    expect(shell).not.toMatch(/keyboardHeight|iPhone14|scrollIntoView|window\.scrollTo/);
  });

  it("G7 ACTIVE and HANDOFF use same geometry owner — no VV stage band", () => {
    const shell = readFileSync(join(ROOT, "components/support/SupportSheetShell.tsx"), "utf8");
    const geoSrc = readFileSync(join(ROOT, "lib/support/support-sheet-geometry.ts"), "utf8");
    const host = readFileSync(join(ROOT, "components/support/SupportModalHost.tsx"), "utf8");
    expect(shell).toContain("resolveSupportSheetGeometry");
    expect(shell).toMatch(/stageStyle:\s*CSSProperties\s*\|\s*undefined\s*=\s*undefined/);
    expect(shell).toContain('data-support-apply-stage-band="0"');
    expect(shell).toContain('data-support-applies-offset-top="0"');
    expect(geoSrc).toContain("applyStageBand: false");
    expect(host).toContain("SupportSheetShell");
    expect(host).not.toContain("visualViewportOffsetTop");
    expect(host).not.toContain("stageStyle");
  });
});
