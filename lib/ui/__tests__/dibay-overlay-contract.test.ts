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
    expect(OVERLAY_COLOR.primary).toBe("#085C3F");
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
    expect(css).toContain("--overlay-primary: #085c3f");
    expect(css).toContain("--overlay-backdrop: rgba(0, 0, 0, 0.5)");
    expect(css).toContain("--overlay-backdrop-blur: 4px");
    expect(css).toContain("--overlay-press-scale: 0.98");
    expect(css).toContain(".dibay-overlay-btn--primary");
    expect(css).toContain(".dibay-overlay-btn--destructive");
    expect(css).toContain('data-sheet-anchor="above-bottom-nav"');
    expect(css).toContain("var(--app-bottom-nav-height, 60px)");
    expect(css).toContain("var(--delivery-home-overhang, 0px)");
    expect(css).toContain("--app-bottom-nav-orbit-rise");
    expect(css).toMatch(/\.dibay-overlay-root\s*\{[^}]*\btop:\s*0;/);
    expect(css).toMatch(/\.dibay-overlay-root\s*\{[^}]*\bbottom:\s*0;/);
    expect(css).not.toMatch(/\.dibay-overlay-root\s*\{[^}]*\binset:\s*0/);
  });

  it("overlay root must not hijack Capacitor backButton / history", () => {
    const src = read("components/ui/dibay-overlay/DibayOverlayRoot.tsx");
    // Prohibit executable hijacks only — ban-list comments may name the APIs.
    const executable = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(executable).toContain("sheetAnchor");
    expect(executable).not.toContain("pushState");
    expect(executable).not.toContain("replaceState");
    expect(executable).not.toMatch(/\bpopstate\b/);
    expect(executable).not.toContain("backButton");
    expect(executable).not.toContain("@capacitor/app");
    expect(executable).not.toContain("__dibayOverlay");
  });

  it("bottom sheet wires above-nav anchor into overlay root", () => {
    const src = read("components/ui/dibay-overlay/DibayBottomSheet.tsx");
    expect(src).toContain("sheetAnchor={anchor}");
    expect(src).toContain("OVERLAY_SHEET_ABOVE_NAV.maxHClass");
    expect(src).toContain("hasFooter");
    expect(src).toContain("overflow-hidden");
    expect(src).toContain("overflow-y-auto overscroll-contain");
  });

  it("promote sheet pins CTAs in footer above bottom nav", () => {
    const src = read("components/post/MemberPostPromoteSheet.tsx");
    expect(src).toContain("footer={successFooter ?? catalogFooter}");
    expect(src).toContain('anchor="above-bottom-nav"');
    expect(src).not.toContain("OverlayUi.actionsRow} mt-2");
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

  it("BottomNav MAIN domain confirm dialog removed — no DibayConfirmDialog path", () => {
    expect(() => read("lib/navigation/main-bottom-nav-domain-transition-dialog.tsx")).toThrow();
    const bottomNav = read("components/layout/BottomNav.tsx");
    expect(bottomNav).not.toContain("resolveBottomNavTransitionConfirmCopy");
    expect(bottomNav).not.toContain("MainBottomNavDomainTransitionDialog");
    expect(bottomNav).not.toContain("nav_cross_domain_confirm");
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

  it("prompt dialog is part of app dialog host", () => {
    const provider = read("components/ui/dibay-overlay/DibayAppDialogProvider.tsx");
    const prompt = read("components/ui/dibay-overlay/DibayPromptDialog.tsx");
    expect(provider).toContain("dibayPrompt");
    expect(provider).toContain("DibayPromptDialog");
    expect(prompt).toContain("OverlayUi.input");
    expect(OverlayUi.input).toContain("dibay-overlay-input");
    const css = read("app/dibay-overlay.css");
    expect(css).toContain(".dibay-overlay-input");
  });
});
