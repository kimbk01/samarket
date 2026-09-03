import { describe, expect, it, beforeEach } from "vitest";
import { shouldRenderMainBottomNav } from "@/lib/navigation/bottom-nav-route-policy";
import {
  closeSupportModal,
  getSupportModalState,
  openSupportModal,
  resetSupportModalToStart,
  setSupportModalCaseId,
} from "@/lib/support/support-modal-controller";
import { deliverSupportOpen } from "@/lib/support/deliver-support-open";
import { buildMemberSupportContext } from "@/lib/support/support-context";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..");

describe("support modal CUT A / reconstruction contracts", () => {
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

  it("deliverSupportOpen is the single entry for case and context", () => {
    const miss = deliverSupportOpen({ source: "cta" });
    expect(miss.ok).toBe(false);

    const ctx = buildMemberSupportContext({
      enabled: true,
      category: "ORDER",
      sourceSurface: "order_detail",
    });
    const start = deliverSupportOpen({ context: ctx, source: "fab" });
    expect(start.ok).toBe(true);
    expect(getSupportModalState().phase).toBe("open");
    expect(getSupportModalState().caseId).toBeNull();

    closeSupportModal();
    const active = deliverSupportOpen({
      caseId: "case-recon-1",
      source: "push",
    });
    expect(active.ok).toBe(true);
    expect(getSupportModalState().caseId).toBe("case-recon-1");
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

  it("새 문의하기 resets to START with generic category gate (keeps audience shell)", () => {
    const ctx = buildMemberSupportContext({
      enabled: true,
      category: "ORDER",
      sourceSurface: "order_detail",
    });
    openSupportModal({ context: ctx });
    setSupportModalCaseId("case-1");
    // Controller default (no nextContext): clear category/ref for triage START.
    resetSupportModalToStart();
    expect(getSupportModalState().phase).toBe("open");
    expect(getSupportModalState().caseId).toBeNull();
    expect(getSupportModalState().context?.audience).toBe("MEMBER");
    expect(getSupportModalState().context?.sourceSurface).toBe("order_detail");
    expect(getSupportModalState().context?.category).toBe("");
    expect(getSupportModalState().context?.needsCategorySelection).toBe(true);
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

  it("ONE geometry owner SupportSheetShell — no Support heightPx/keyboard dual", () => {
    const host = readFileSync(
      join(ROOT, "components/support/SupportModalHost.tsx"),
      "utf8"
    );
    const shell = readFileSync(
      join(ROOT, "components/support/SupportSheetShell.tsx"),
      "utf8"
    );
    expect(host).toContain("SupportSheetShell");
    expect(host).not.toContain("DibayBottomSheet");
    expect(host).not.toContain("SUPPORT_SHEET_KB_MIN_HEIGHT_PX");
    expect(host).not.toContain("keyboardBandActive");
    expect(host).not.toContain("activeSheetHeightPx");
    expect(host).not.toContain("keyboardStageStyle");
    expect(host).not.toContain("heightPx=");
    expect(host).not.toContain("scrollIntoView");
    expect(host).toContain("json.message");
    expect(host).toContain("el.scrollTop = el.scrollHeight");
    expect(host).toContain('data-support-message-list="1"');
    expect(host).toContain('data-support-composer="1"');
    expect(host).toContain("data-form-keyboard-field");
    expect(shell).toContain("keyboardOpen");
    expect(shell).toContain("useFormKeyboardViewport");
    expect(shell).toContain("effectiveBottomInset");
    expect(shell).toContain("SUPPORT_SHEET_HEIGHT_RATIO");
    expect(shell).toContain("0.8");
    expect(shell).not.toContain("heightPx = vv");
  });

  it("eager SupportModalHost independent of FAB lazy host", () => {
    const shell = readFileSync(
      join(ROOT, "components/layout/ConditionalAppShell.tsx"),
      "utf8"
    );
    const fabHost = readFileSync(
      join(ROOT, "components/support/SupportFabHost.tsx"),
      "utf8"
    );
    expect(shell).toContain("SupportModalHost");
    expect(shell).toContain("<SupportModalHost />");
    expect(shell).toContain("SupportFabHostLazy");
    expect(fabHost).not.toContain("SupportModalHost");
  });

  it("push uses deliverSupportOpen and marks after success", () => {
    const listener = readFileSync(
      join(ROOT, "components/push/PushRouteListener.tsx"),
      "utf8"
    );
    expect(listener).toContain("deliverSupportOpen");
    expect(listener).toContain('source: "push"');
    expect(listener).toContain("markNotificationConsumed");
    expect(listener).toContain("isDuplicateNotification");
    expect(listener).toContain('"support_modal"');
    expect(listener).toContain("markNotificationConsumed(notificationId)");
    expect(listener).not.toContain("shouldIgnoreNotification");
    expect(listener).not.toContain("openSupportModal({ caseId: supportCaseId })");
  });

  it("navigateToSupportCenter opens via deliverSupportOpen", () => {
    const openSrc = readFileSync(join(ROOT, "lib/support/open-support-center.ts"), "utf8");
    expect(openSrc).toContain("deliverSupportOpen");
    expect(openSrc).toContain("navigateToSupportCenter");
    expect(openSrc).not.toContain("window.location.assign");
  });

  it("DibayBottomSheet no longer exposes Support heightPx dual mode", () => {
    const sheet = readFileSync(
      join(ROOT, "components/ui/dibay-overlay/DibayBottomSheet.tsx"),
      "utf8"
    );
    expect(sheet).toContain("heightRatio");
    expect(sheet).not.toContain("heightPx");
    expect(sheet).toContain("Support Modal does not use this component");
  });
});
