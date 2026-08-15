/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DIBAY_OVERLAY_HARD_LOCK,
  OVERLAY_COLOR,
  OVERLAY_PRESS_SCALE,
  OVERLAY_RADIUS_PX,
  OVERLAY_SHEET_ABOVE_NAV,
  OverlayUi,
} from "@/lib/ui/dibay-overlay-contract";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

describe("DIBAY Overlay SSOT contract", () => {
  it("locks attachment primary / danger / backdrop colors", () => {
    expect(OVERLAY_COLOR.primary).toBe("#0B5C3F");
    expect(OVERLAY_COLOR.primaryDark).toBe("#084732");
    expect(OVERLAY_COLOR.danger).toBe("#E53935");
    expect(OVERLAY_COLOR.backdrop).toBe("rgba(0, 0, 0, 0.5)");
    expect(OVERLAY_PRESS_SCALE).toBe(0.98);
    expect(OVERLAY_RADIUS_PX.md).toBe(12);
    expect(OVERLAY_RADIUS_PX.xl).toBe(24);
  });

  it("uses MAIN_BOTTOM_NAV_SHEET geometry for above-nav sheets", () => {
    expect(OVERLAY_SHEET_ABOVE_NAV.bottomClass).toContain("--app-bottom-nav-height");
    expect(OVERLAY_SHEET_ABOVE_NAV.bottomClass).toContain("--safe-bottom");
    expect(OVERLAY_SHEET_ABOVE_NAV.maxHClass).toContain("78dvh");
  });

  it("CSS tokens match attachment SSOT", () => {
    const css = read("app/dibay-overlay.css");
    expect(css).toContain("--overlay-primary: #0b5c3f");
    expect(css).toContain("--overlay-backdrop: rgba(0, 0, 0, 0.5)");
    expect(css).toContain("--overlay-backdrop-blur: 4px");
    expect(css).toContain("--overlay-press-scale: 0.98");
    expect(css).toContain(".dibay-overlay-btn--primary");
    expect(css).toContain(".dibay-overlay-btn--destructive");
  });

  it("confirm dialog enforces horizontal cancel|confirm order", () => {
    const src = read("components/ui/dibay-overlay/DibayConfirmDialog.tsx");
    expect(src).toContain('key: "cancel"');
    expect(src).toContain('key: "confirm"');
    expect(src).toContain('roleTone: "secondary"');
    expect(src.indexOf('key: "cancel"')).toBeLessThan(src.indexOf('key: "confirm"'));
  });

  it("outgoing call confirm no longer uses iOS #007AFF", () => {
    const src = read("components/community-messenger/MessengerOutgoingCallConfirmDialog.tsx");
    expect(src).not.toContain("#007AFF");
    expect(src).toContain("DibayConfirmDialog");
    expect(DIBAY_OVERLAY_HARD_LOCK.forbiddenCallConfirmHex).toBe("#007AFF");
  });

  it("friend profile sheet uses above-bottom-nav DibayBottomSheet", () => {
    const src = read("components/community-messenger/MessengerFriendProfileSheet.tsx");
    expect(src).toContain("DibayBottomSheet");
    expect(src).toContain('anchor="above-bottom-nav"');
    expect(src).not.toContain("bg-black/25");
  });

  it("domain transition uses DibayConfirmDialog", () => {
    const src = read("lib/navigation/main-bottom-nav-domain-transition-dialog.tsx");
    expect(src).toContain("DibayConfirmDialog");
    expect(src).not.toContain("bg-black/50");
  });

  it("MobileConfirm absorbs into DibayConfirmDialog", () => {
    const src = read("components/ui/MobileConfirmBottomSheet.tsx");
    expect(src).toContain("DibayConfirmDialog");
    expect(src).not.toContain("createPortal");
  });

  it("exports overlay button role classes", () => {
    expect(OverlayUi.btn.primary).toContain("dibay-overlay-btn--primary");
    expect(OverlayUi.btn.secondary).toContain("dibay-overlay-btn--secondary");
    expect(OverlayUi.btn.destructive).toContain("dibay-overlay-btn--destructive");
    expect(OverlayUi.btn.text).toContain("dibay-overlay-btn--text");
  });
});
