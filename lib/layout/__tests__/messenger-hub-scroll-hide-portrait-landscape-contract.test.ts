import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("messenger hub list scroll authority (portrait+landscape)", () => {
  it("MasterDetail list pane never uses overflow-y-auto (hub and split)", () => {
    const src = readFileSync(
      resolve(root, "components/community-messenger/home/CommunityMessengerHomeMasterDetail.tsx"),
      "utf8"
    );
    expect(src).toContain("overflow-hidden");
    expect(src).toContain("LIST_PANE_SPLIT_CLASS");
    expect(src).toContain("LIST_PANE_HUB_CLASS");
    // class strings must not enable pane scroll (comment may mention the ban)
    expect(src).not.toMatch(/LIST_PANE_[A-Z_]+ = `[^`]*overflow-y-auto/);
  });

  it("viewport-locked hub body uses child-scroll-lock so list owns overflow", () => {
    const shell = readFileSync(resolve(root, "app/app-shell.css"), "utf8");
    const app = readFileSync(resolve(root, "components/layout/ConditionalAppShell.tsx"), "utf8");
    expect(shell).toContain("main-hub-scroll-body--child-scroll-lock");
    expect(shell).toMatch(
      /\.main-hub-scroll-body--child-scroll-lock\s*\{[^}]*overflow-y:\s*hidden/
    );
    expect(app).toContain("main-hub-scroll-body--child-scroll-lock");
    expect(app).toContain("isMainColumnViewportLocked");
  });

  it("MessengerHomeMainSections keeps list scroll SSOT for all section tabs", () => {
    const src = readFileSync(
      resolve(root, "components/community-messenger/MessengerHomeMainSections.tsx"),
      "utf8"
    );
    expect(src).toContain('data-messenger-hub-list-scroll=""');
    expect(src).toContain("overflow-y-auto");
    expect(src).toContain('mainSection === "friends"');
    expect(src).toContain('mainSection === "call_logs"');
    expect(src).toContain('mainSection === "chats"');
    expect(src).toContain('mainSection === "archive"');
  });

  it("does not collapse safe-top owners (mobile StickyHeader vs split SplitTopBar)", () => {
    const sticky = readFileSync(resolve(root, "components/layout/AppStickyHeader.tsx"), "utf8");
    const split = readFileSync(
      resolve(root, "components/community-messenger/MessengerSplitTopBar.tsx"),
      "utf8"
    );
    expect(sticky).toContain("isMessengerSplit && isCommunityMessengerSurface");
    expect(sticky).toContain("return null");
    expect(split).toContain("pt-[var(--safe-top)]");
  });
});
