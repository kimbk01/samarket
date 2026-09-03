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
    expect(g.stageTopPx).toBe(0);
    expect(g.stageHeightPx).toBe(753);
    expect(g.sheetHeightPx).toBe(Math.round(753 * SUPPORT_SHEET_HEIGHT_RATIO));
    expect(g.appliesOffsetTopToStage).toBe(false);
  });

  it("G2 keyboard open height reduced + offsetTop>0 → stage top stays 0 (header stays in VV)", () => {
    // iPhoneBK C5 evidence
    const g = resolveSupportSheetGeometry({
      visualViewportHeight: 587,
      visualViewportOffsetTop: 179,
      layoutHeight: 753,
    });
    expect(g.stageTopPx).toBe(0);
    expect(g.stageHeightPx).toBe(587);
    expect(g.sheetHeightPx).toBe(Math.round(587 * SUPPORT_SHEET_HEIGHT_RATIO));
    expect(g.appliesOffsetTopToStage).toBe(false);
    // Old bug: stageTop=179 would yield headerRelTop≈-49
    expect(g.stageTopPx).not.toBe(179);
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
    expect(closed.stageTopPx).toBe(0);
    expect(open.stageTopPx).toBe(0);
    expect(open.stageTopPx).toBe(closed.stageTopPx);
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
    expect(open.stageHeightPx).toBeLessThan(closed.stageHeightPx);
  });

  it("G5 sheet stays within stage (composer/action above keyboard band)", () => {
    const g = resolveSupportSheetGeometry({
      visualViewportHeight: 587,
      visualViewportOffsetTop: 179,
      layoutHeight: 753,
    });
    expect(g.sheetHeightPx).toBeLessThanOrEqual(g.stageHeightPx);
    expect(g.sheetHeightPx / g.stageHeightPx).toBeCloseTo(SUPPORT_SHEET_HEIGHT_RATIO, 2);
  });

  it("G6 no hardcoded device keyboard height in geometry module or shell", () => {
    const geo = readFileSync(join(ROOT, "lib/support/support-sheet-geometry.ts"), "utf8");
    const shell = readFileSync(join(ROOT, "components/support/SupportSheetShell.tsx"), "utf8");
    expect(geo).not.toMatch(/keyboardHeight|iPhone14|336px|290px/);
    expect(shell).not.toMatch(/keyboardHeight|iPhone14|safeVisibleTop\s*=\s*\d+/);
    expect(shell).not.toContain("scrollIntoView");
    expect(shell).not.toContain("window.scrollTo");
  });

  it("G7 ACTIVE and HANDOFF use same geometry owner", () => {
    const shell = readFileSync(join(ROOT, "components/support/SupportSheetShell.tsx"), "utf8");
    const host = readFileSync(join(ROOT, "components/support/SupportModalHost.tsx"), "utf8");
    expect(shell).toContain("resolveSupportSheetGeometry");
    expect(shell).toContain("stageTopPx");
    expect(shell).toContain("data-support-applies-offset-top");
    expect(shell).toContain("appliesOffsetTopToStage");
    expect(host).toContain("SupportSheetShell");
    expect(host).not.toContain("visualViewportOffsetTop");
    expect(host).not.toContain("stageStyle");
  });
});
