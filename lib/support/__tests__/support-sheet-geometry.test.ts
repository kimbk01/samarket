import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  resolveSupportSheetGeometry,
  SUPPORT_SHEET_HEIGHT_RATIO,
} from "@/lib/support/support-sheet-geometry";

const ROOT = join(__dirname, "..", "..", "..");

describe("support sheet geometry — header / timeline / composer SSOT", () => {
  it("G1 keyboard closed → full usable height, safe padding only", () => {
    const g = resolveSupportSheetGeometry({
      visualViewportHeight: 753,
      visualViewportOffsetTop: 0,
      layoutHeight: 753,
      keyboardOpen: false,
      keyboardOcclusionInset: 0,
      safeBottom: 34,
    });
    expect(g.bandKnown).toBe(true);
    expect(g.applyStageBand).toBe(false);
    expect(g.stageTopPx).toBe(0);
    expect(g.sheetHeightPx).toBe(753);
    expect(g.sheetLiftPx).toBe(0);
    expect(g.paddingBottomPx).toBe(34);
    expect(SUPPORT_SHEET_HEIGHT_RATIO).toBe(1);
  });

  it("G2 Cap iPhoneBK open (offsetTop>0, layout-aligned) → band inside layout, no stage offsetTop", () => {
    // Proven device frame: vvH=587, innerH=753, offsetTop=179
    const g = resolveSupportSheetGeometry({
      visualViewportHeight: 587,
      visualViewportOffsetTop: 179,
      layoutHeight: 753,
      keyboardOpen: true,
      keyboardOcclusionInset: 0,
      safeBottom: 34,
    });
    expect(g.stageTopPx).toBe(0);
    expect(g.applyStageBand).toBe(false);
    expect(g.appliesOffsetTopToStage).toBe(false);
    // visualBottom 766 clamped to 753 → height 753-179=574, lift 0
    expect(g.sheetHeightPx).toBe(574);
    expect(g.sheetLiftPx).toBe(0);
    expect(g.paddingBottomPx).toBe(0);
    // Sheet top in layout Y = 753-574 = 179 = offsetTop (header flush with visual top)
    expect(753 - g.sheetHeightPx - g.sheetLiftPx).toBe(179);
  });

  it("G3 iOS overlay no pan → height=vvH, lift=occlusion gap, no stage offsetTop", () => {
    const open = resolveSupportSheetGeometry({
      visualViewportHeight: 587,
      visualViewportOffsetTop: 0,
      layoutHeight: 753,
      keyboardOpen: true,
      keyboardOcclusionInset: 166,
      safeBottom: 34,
    });
    expect(open.stageTopPx).toBe(0);
    expect(open.appliesOffsetTopToStage).toBe(false);
    expect(open.sheetHeightPx).toBe(587);
    expect(open.sheetLiftPx).toBe(166);
    expect(open.paddingBottomPx).toBe(0);
    expect(753 - open.sheetHeightPx - open.sheetLiftPx).toBe(0);
  });

  it("G4 Android layout_resize → fill resized layout, no lift, no pad", () => {
    const g = resolveSupportSheetGeometry({
      visualViewportHeight: 587,
      visualViewportOffsetTop: 0,
      layoutHeight: 587,
      keyboardOpen: true,
      keyboardOcclusionInset: 0,
      safeBottom: 34,
    });
    expect(g.sheetHeightPx).toBe(587);
    expect(g.sheetLiftPx).toBe(0);
    expect(g.paddingBottomPx).toBe(0);
  });

  it("G5 open height is full visible band (not 80% — timeline must stay usable)", () => {
    const g = resolveSupportSheetGeometry({
      visualViewportHeight: 587,
      visualViewportOffsetTop: 179,
      layoutHeight: 753,
      keyboardOpen: true,
      keyboardOcclusionInset: 0,
      safeBottom: 34,
    });
    expect(g.sheetHeightPx).toBe(574);
    expect(g.sheetHeightPx).toBeGreaterThan(500);
    // Header(~80)+composer(~72) leave room for timeline
    expect(g.sheetHeightPx - 80 - 72).toBeGreaterThan(300);
  });

  it("G6 no hardcoded device keyboard px; lift from VV frame; never stage offsetTop", () => {
    const geo = readFileSync(join(ROOT, "lib/support/support-sheet-geometry.ts"), "utf8");
    const shell = readFileSync(join(ROOT, "components/support/SupportSheetShell.tsx"), "utf8");
    expect(geo).not.toMatch(/keyboardHeight|iPhone14|336px|290px/);
    expect(shell).not.toMatch(/keyboardHeight|iPhone14|scrollIntoView|window\.scrollTo/);
    expect(shell).toContain("sheetLiftPx");
    expect(shell).toContain("marginBottom");
    expect(shell).toMatch(/stageStyle:\s*CSSProperties\s*\|\s*undefined\s*=\s*undefined/);
    expect(shell).toContain('data-support-applies-offset-top="0"');
  });

  it("G7 ACTIVE and HANDOFF share one owner; header marker present", () => {
    const shell = readFileSync(join(ROOT, "components/support/SupportSheetShell.tsx"), "utf8");
    const host = readFileSync(join(ROOT, "components/support/SupportModalHost.tsx"), "utf8");
    const geoSrc = readFileSync(join(ROOT, "lib/support/support-sheet-geometry.ts"), "utf8");
    expect(shell).toContain("resolveSupportSheetGeometry");
    expect(shell).toContain('data-support-apply-stage-band="0"');
    expect(geoSrc).toContain("SUPPORT_SHEET_HEIGHT_RATIO = 1");
    expect(host).toContain("SupportSheetShell");
    expect(host).toContain('data-support-sheet-header="1"');
    expect(host).toContain('data-support-message-list="1"');
    expect(host).toContain('data-support-composer="1"');
    expect(host).not.toContain("visualViewportOffsetTop");
  });

  it("G8 never double-count keyboard as height shrink + inner padding", () => {
    const overlay = resolveSupportSheetGeometry({
      visualViewportHeight: 587,
      visualViewportOffsetTop: 0,
      layoutHeight: 753,
      keyboardOpen: true,
      keyboardOcclusionInset: 166,
      safeBottom: 34,
    });
    expect(overlay.sheetHeightPx).toBe(587);
    expect(overlay.sheetLiftPx).toBe(166);
    expect(overlay.paddingBottomPx).toBe(0);
  });

  it("G9 iPad-scale frame uses same formula (no device branch)", () => {
    const g = resolveSupportSheetGeometry({
      visualViewportHeight: 900,
      visualViewportOffsetTop: 120,
      layoutHeight: 1180,
      keyboardOpen: true,
      keyboardOcclusionInset: 0,
      safeBottom: 20,
    });
    // visualBottom 1020 < 1180 → height 900, lift 160
    expect(g.sheetHeightPx).toBe(900);
    expect(g.sheetLiftPx).toBe(160);
    expect(g.paddingBottomPx).toBe(0);
    expect(1180 - g.sheetHeightPx - g.sheetLiftPx).toBe(120);
  });
});
