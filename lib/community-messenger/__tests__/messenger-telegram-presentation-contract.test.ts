import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MESSENGER_HOME_SECTION_ENTER_MS } from "@/lib/community-messenger/messenger-home-section-slide";
import {
  MESSENGER_LIST_ROOM_ENTER_MS,
  MESSENGER_LIST_ROOM_EXIT_MS,
} from "@/lib/community-messenger/messenger-list-room-slide";
import { MESSENGER_SPLIT_LIST_PANE_CLASS } from "@/lib/ui/messenger-split-pane-layout";

const root = resolve(process.cwd());

describe("messenger presentation contract", () => {
  it("section transition is 440ms full pane slide (product SSOT)", () => {
    expect(MESSENGER_HOME_SECTION_ENTER_MS).toBe(440);
  });

  it("room enter is 440ms right-to-left (product SSOT)", () => {
    expect(MESSENGER_LIST_ROOM_ENTER_MS).toBe(440);
    expect(MESSENGER_LIST_ROOM_EXIT_MS).toBe(360);
  });

  it("wide list pane uses clamp(360px, 35vw, 470px)", () => {
    expect(MESSENGER_SPLIT_LIST_PANE_CLASS).toContain("clamp(360px,35vw,470px)");
    expect(MESSENGER_SPLIT_LIST_PANE_CLASS).toContain("max-w-[470px]");
    expect(MESSENGER_SPLIT_LIST_PANE_CLASS).not.toContain("38vw");
    expect(MESSENGER_SPLIT_LIST_PANE_CLASS).not.toContain("420px");
  });

  it("CSS durations match TS SSOT and room enter slides from 100%", () => {
    const css = readFileSync(resolve(root, "app/messenger-view-transitions.css"), "utf8");
    expect(css).toContain("--sam-messenger-home-section-enter-duration: 440ms");
    expect(css).toContain("--sam-messenger-room-enter-duration: 440ms");
    expect(css).toContain("--sam-messenger-room-exit-duration: 360ms");
    expect(css).toContain("--sam-messenger-call-enter-duration: 180ms");
    expect(css).toContain("--sam-messenger-call-peer-detail-enter-duration: 180ms");
    expect(css).toContain("--sam-messenger-pillar-list-enter-duration: 440ms");
    expect(css).toMatch(/\.messenger-enter \{\s*transform: translate3d\(100%/);
    expect(css).toContain('[data-messenger-responsive-shell="wide"] .messenger-enter');
    expect(css).toContain("translate3d(100%, 0, 0)");
    expect(css).toContain("sam-messenger-pillar-list-enter-ltr");
    expect(css).toContain("translate3d(-100%, 0, 0)");
    expect(css).not.toContain("sam-messenger-pillar-list-enter-rtl");
  });

  it("split-room-pane transform:none must not kill enter phase", () => {
    const css = readFileSync(resolve(root, "app/messenger-view-transitions.css"), "utf8");
    expect(css).toContain(
      "[data-messenger-split-room-pane] .messenger-page:not(.messenger-enter):not(.messenger-enter-active)"
    );
    const killBlock = css.match(
      /\[data-messenger-split-room-pane\] \.messenger-page[\s\S]*?contain: none !important;/
    );
    expect(killBlock?.[0] ?? "").not.toMatch(/transform:\s*none\s*!important/);
    expect(css).toMatch(
      /\.messenger-page:not\(\.messenger-enter\):not\(\.messenger-enter-active\)[\s\S]*?transform:\s*none\s*!important/
    );
  });

  it("call slide SSOT stays in Telegram short band", async () => {
    const { MESSENGER_CALL_SLIDE_ENTER_MS, MESSENGER_CALL_SLIDE_EXIT_MS } = await import(
      "@/lib/community-messenger/messenger-call-slide"
    );
    expect(MESSENGER_CALL_SLIDE_ENTER_MS).toBeGreaterThanOrEqual(150);
    expect(MESSENGER_CALL_SLIDE_ENTER_MS).toBeLessThanOrEqual(250);
    expect(MESSENGER_CALL_SLIDE_EXIT_MS).toBeGreaterThanOrEqual(130);
    expect(MESSENGER_CALL_SLIDE_EXIT_MS).toBeLessThanOrEqual(220);
  });

  it("presentation density tokens stay in messenger scope", () => {
    const css = readFileSync(resolve(root, "app/messenger-presentation.css"), "utf8");
    expect(css).toContain("--cm-list-row-min-h: 72px");
    expect(css).toContain("--cm-list-avatar: 52px");
    expect(css).toContain("--cm-list-title-size: 15px");
    expect(css).toContain("--cm-list-row-selected");
    expect(css).toContain("font-size: 16px");
    expect(css).toContain(".cm-messenger-wallpaper");
    expect(css).not.toContain("border-radius: 16px");
  });

  it("AppStickyHeader skips messenger split to avoid double safe-top", () => {
    const src = readFileSync(resolve(root, "components/layout/AppStickyHeader.tsx"), "utf8");
    expect(src).toContain("isMessengerSplit && isCommunityMessengerSurface");
    expect(src).toContain("return null");
  });

  it("section tabs use rounded-ui-rect not pill", () => {
    const src = readFileSync(
      resolve(root, "components/community-messenger/MessengerHomeSectionTabs.tsx"),
      "utf8"
    );
    expect(src).toContain("rounded-ui-rect");
    expect(src).not.toMatch(/SECTION_TAB_PILL|알약 탭/);
    expect(src).not.toMatch(/SECTION_TAB_RECT_FRAME[\s\S]*rounded-full/);
  });

  it("section transition does not remount children via key=generation", () => {
    const src = readFileSync(
      resolve(root, "components/community-messenger/MessengerHomeSectionTransition.tsx"),
      "utf8"
    );
    expect(src).not.toMatch(/key=\{[^}]*generation/);
    expect(src).toContain("data-messenger-section-transition-generation");
  });
});
