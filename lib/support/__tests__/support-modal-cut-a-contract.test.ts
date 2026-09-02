import { describe, expect, it, beforeEach } from "vitest";
import { shouldRenderMainBottomNav } from "@/lib/navigation/bottom-nav-route-policy";
import {
  closeSupportModal,
  getSupportModalState,
  openSupportModal,
  resetSupportModalToStart,
  setSupportModalCaseId,
} from "@/lib/support/support-modal-controller";
import { buildMemberSupportContext } from "@/lib/support/support-context";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..");

describe("support modal CUT A contracts", () => {
  beforeEach(() => {
    closeSupportModal();
  });

  it("openSupportModal requires enabled context or caseId", () => {
    expect(
      openSupportModal({
        context: buildMemberSupportContext({
          enabled: false,
          category: "OTHER",
          sourceSurface: "test",
        }),
      })
    ).toBe(false);
    expect(
      openSupportModal({
        context: buildMemberSupportContext({
          enabled: true,
          category: "ORDER",
          sourceSurface: "order_detail",
        }),
      })
    ).toBe(true);
    expect(getSupportModalState().phase).toBe("open");
    expect(getSupportModalState().caseId).toBeNull();
  });

  it("문의하기 path does not invent caseId until setSupportModalCaseId", () => {
    openSupportModal({
      context: buildMemberSupportContext({
        enabled: true,
        category: "ORDER",
        sourceSurface: "order_detail",
      }),
    });
    expect(getSupportModalState().caseId).toBeNull();
    setSupportModalCaseId("case-1");
    expect(getSupportModalState().caseId).toBe("case-1");
  });

  it("closeSupportModal clears UI state only (controller level)", () => {
    openSupportModal({
      context: buildMemberSupportContext({
        enabled: true,
        category: "ORDER",
        sourceSurface: "order_detail",
      }),
    });
    setSupportModalCaseId("case-1");
    closeSupportModal();
    expect(getSupportModalState().phase).toBe("closed");
    expect(getSupportModalState().caseId).toBeNull();
  });

  it("새 문의하기 resets to START without clearing context", () => {
    const ctx = buildMemberSupportContext({
      enabled: true,
      category: "ORDER",
      sourceSurface: "order_detail",
    });
    openSupportModal({ context: ctx });
    setSupportModalCaseId("case-1");
    resetSupportModalToStart();
    expect(getSupportModalState().phase).toBe("open");
    expect(getSupportModalState().caseId).toBeNull();
    expect(getSupportModalState().context?.category).toBe("ORDER");
  });

  it("shouldRenderMainBottomNav hides when support modal suppress flag set", () => {
    expect(
      shouldRenderMainBottomNav({
        pathname: "/market",
        supportModalSuppressesBottomNav: true,
      })
    ).toBe(false);
    expect(
      shouldRenderMainBottomNav({
        pathname: "/market",
        supportModalSuppressesBottomNav: false,
      })
    ).toBe(true);
  });

  it("Support sheet wiring uses device-bottom and heightRatio 0.8 (no fake handle)", () => {
    const host = readFileSync(
      join(ROOT, "components/support/SupportModalHost.tsx"),
      "utf8"
    );
    expect(host).toContain('anchor="device-bottom"');
    expect(host).toContain("showHandle={false}");
    expect(host).toContain("heightRatio={SUPPORT_SHEET_HEIGHT_RATIO}");
    expect(host).toContain("0.8");
    expect(host).toContain("heightPx={activeSheetHeightPx}");
    expect(host).toContain("stageStyle={keyboardStageStyle}");
    expect(host).toContain("load({ silent: true })");
    expect(host).toContain("json.message");
    expect(host).toContain("el.scrollTop = el.scrollHeight");
    expect(host).not.toContain("scrollIntoView");
    expect(host).not.toContain("above-bottom-nav");
    expect(host).not.toContain("contentPaddingBottomPx={keyboardInset");
  });

  it("DibayBottomSheet exposes heightRatio and dismissible", () => {
    const sheet = readFileSync(
      join(ROOT, "components/ui/dibay-overlay/DibayBottomSheet.tsx"),
      "utf8"
    );
    expect(sheet).toContain("heightRatio");
    expect(sheet).toContain("heightPx");
    expect(sheet).toContain("dismissible");
    expect(sheet).toContain("stageStyle");
  });

  it("overlay root gates 하→상 enter on mounted + double rAF", () => {
    const root = readFileSync(
      join(ROOT, "components/ui/dibay-overlay/DibayOverlayRoot.tsx"),
      "utf8"
    );
    expect(root).toContain("if (!mounted) return");
    expect(root).toContain("requestAnimationFrame(() => setEntered(true))");
    expect(root).toMatch(/requestAnimationFrame\(\(\) => \{\s*raf2 = requestAnimationFrame/);
    expect(root).toContain("[open, mounted]");
  });

  it("navigateToSupportCenter opens modal (no hard assign as primary)", () => {
    const openSrc = readFileSync(join(ROOT, "lib/support/open-support-center.ts"), "utf8");
    expect(openSrc).toContain("openSupportModal");
    expect(openSrc).toContain("navigateToSupportCenter");
  });
});
