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
  OVERLAY_SHEET_MAX_H_CLASS,
  OverlayUi,
} from "@/lib/ui/dibay-overlay-contract";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

describe("DIBAY Overlay SSOT contract", () => {
  it("locks attachment primary / danger / backdrop colors", () => {
    // CSS 토큰과 같은 값 (팝업 SSOT T1 — 예전 #085C3F / #E53935 정정)
    expect(OVERLAY_COLOR.primary).toBe("#0B421A");
    expect(OVERLAY_COLOR.danger).toBe("#D45252");
    expect(OVERLAY_COLOR.backdrop).toBe("rgba(0, 0, 0, 0.5)");
    expect(OVERLAY_PRESS_SCALE).toBe(0.98);
    expect(OVERLAY_RADIUS_PX.md).toBe(12);
    expect(OVERLAY_RADIUS_PX.xl).toBe(24);
  });

  it("popup SSOT T1 — wrap rules, one press language, gray disabled, 15px buttons", () => {
    const css = read("app/dibay-overlay.css");
    const tokens = read("app/design-tokens.css");
    // TS 색 = CSS 토큰 값
    expect(tokens).toMatch(new RegExp(`--dibay-green:\\s*${OVERLAY_COLOR.primary}`, "i"));
    expect(tokens).toMatch(new RegExp(`--sm-color-danger:\\s*${OVERLAY_COLOR.danger}`, "i"));
    // 줄바꿈: components 레이어 (호출처 truncate 유틸리티가 이김)
    expect(css).toMatch(
      /@layer components\s*\{\s*\.dibay-overlay-title,\s*\.dibay-overlay-body,\s*\.dibay-overlay-caption\s*\{[^}]*white-space:\s*pre-line;[^}]*word-break:\s*keep-all;[^}]*overflow-wrap:\s*anywhere;/
    );
    expect(css).toContain("--overlay-btn-font-size: 15px");
    expect(css).toMatch(/\.dibay-overlay-btn\s*\{[^}]*font-size:\s*var\(--overlay-btn-font-size\)/);
    // 눌림 2종 — 필터·0.94 없음, 목록 행은 배경만
    expect(css).not.toMatch(/brightness\(/);
    expect(css).not.toMatch(/scale\(0\.94\)/);
    expect(css).toMatch(/\.dibay-overlay-btn--destructive:not\(:disabled\):active\s*\{\s*background:\s*var\(--overlay-danger-active\)/);
    expect(css).toMatch(/\.dibay-overlay-action-item:not\(:disabled\):active\s*\{\s*background:[^;]+;\s*\}/);
    // 비활성 = 회색 (opacity 금지)
    expect(css).not.toMatch(/:disabled\s*\{[^}]*opacity:\s*0\./);
    expect(OverlayUi.chip).toBe("dibay-overlay-chip");
    expect(OverlayUi.popover).toBe("dibay-overlay-popover");
    expect(OverlayUi.banner).toBe("dibay-overlay-banner");
  });

  it("bottom sheets start at the device bottom — no nav-relative geometry (Owner 2026-11-01)", () => {
    expect(OVERLAY_SHEET_MAX_H_CLASS).toBe("max-h-[min(82dvh,560px)]");
    expect(OVERLAY_SHEET_MAX_H_CLASS).not.toContain("--app-bottom-nav-height");
    expect(DIBAY_OVERLAY_HARD_LOCK.bottomSheetsMustStartAtDeviceBottom).toBe(true);
  });

  it("CSS tokens match attachment SSOT", () => {
    const css = read("app/dibay-overlay.css");
    // Brand green / danger / text follow light-only base tokens (one brand green #0B421A).
    // Never --sam-*: they flip under prefers-color-scheme dark while the overlay surface stays white.
    expect(css).toContain("--overlay-primary: var(--dibay-green)");
    expect(css).toContain("--overlay-danger: var(--sm-color-danger)");
    expect(css).toContain("--overlay-text-primary: var(--sm-color-text-main)");
    const rootBlock = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));
    expect(rootBlock).not.toMatch(/var\(--sam-/);
    expect(css).not.toMatch(/#085c3f|#e53935/i);
    expect(css).toContain("--overlay-backdrop: rgba(0, 0, 0, 0.5)");
    expect(css).toContain("--overlay-backdrop-blur: 4px");
    expect(css).toContain("--overlay-press-scale: 0.98");
    expect(css).toContain(".dibay-overlay-btn--primary");
    expect(css).toContain(".dibay-overlay-btn--destructive");
    // 시트 = 기기 하단 · safe 는 패널 padding 한 번 (탭 위 오프셋·변형 규칙 없음)
    expect(css).not.toContain("data-sheet-anchor");
    expect(css).not.toMatch(/dibay-overlay-(root--sheet|sheet)[^{]*\{[^}]*--app-bottom-nav-height/);
    expect(css).toMatch(
      /\.dibay-overlay-sheet\s*\{[^}]*padding-bottom:\s*max\(var\(--overlay-space-4\), var\(--kb-safe-bottom, var\(--safe-bottom, 0px\)\)\);/
    );
    // 비활성 = 회색 토큰 (불투명도 금지 · Owner Q4)
    expect(css).toMatch(/\.dibay-overlay-btn:disabled\s*\{[^}]*opacity:\s*1;[^}]*--sm-color-primary-disabled/);
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
    expect(executable).not.toContain("sheetAnchor");
    expect(executable).not.toContain("pushState");
    expect(executable).not.toContain("replaceState");
    expect(executable).not.toMatch(/\bpopstate\b/);
    expect(executable).not.toContain("backButton");
    expect(executable).not.toContain("@capacitor/app");
    expect(executable).not.toContain("__dibayOverlay");
  });

  it("bottom sheet has no anchor — device bottom only", () => {
    const src = read("components/ui/dibay-overlay/DibayBottomSheet.tsx");
    expect(src).not.toContain("sheetAnchor");
    expect(src).not.toContain("anchor");
    expect(src).toContain("OVERLAY_SHEET_MAX_H_CLASS");
    expect(src).toContain("hasFooter");
    expect(src).toContain("overflow-hidden");
    expect(src).toContain("overflow-y-auto overscroll-contain");
  });

  it("promote sheet pins CTAs in footer", () => {
    const src = read("components/post/MemberPostPromoteSheet.tsx");
    expect(src).toContain("footer={successFooter ?? catalogFooter}");
    expect(src).not.toContain("anchor=");
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

  it("friend profile sheet uses DibayBottomSheet (device bottom)", () => {
    const src = read("components/community-messenger/MessengerFriendProfileSheet.tsx");
    expect(src).toContain("DibayBottomSheet");
    expect(src).not.toContain("anchor=");
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
