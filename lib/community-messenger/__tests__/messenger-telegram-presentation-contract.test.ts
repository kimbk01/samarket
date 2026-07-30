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
  it("section transition is ~180ms short slide+fade (Telegram band 150–250)", () => {
    expect(MESSENGER_HOME_SECTION_ENTER_MS).toBe(180);
    expect(MESSENGER_HOME_SECTION_ENTER_MS).toBeGreaterThanOrEqual(150);
    expect(MESSENGER_HOME_SECTION_ENTER_MS).toBeLessThanOrEqual(250);
  });

  it("room enter is ~150ms short push (Telegram band 100–180)", () => {
    expect(MESSENGER_LIST_ROOM_ENTER_MS).toBe(150);
    expect(MESSENGER_LIST_ROOM_ENTER_MS).toBeGreaterThanOrEqual(100);
    expect(MESSENGER_LIST_ROOM_ENTER_MS).toBeLessThanOrEqual(180);
    expect(MESSENGER_LIST_ROOM_EXIT_MS).toBe(130);
  });

  it("wide list pane uses clamp(360px, 35vw, 470px)", () => {
    expect(MESSENGER_SPLIT_LIST_PANE_CLASS).toContain("clamp(360px,35vw,470px)");
    expect(MESSENGER_SPLIT_LIST_PANE_CLASS).toContain("max-w-[470px]");
    expect(MESSENGER_SPLIT_LIST_PANE_CLASS).not.toContain("38vw");
    expect(MESSENGER_SPLIT_LIST_PANE_CLASS).not.toContain("420px");
  });

  it("CSS durations match TS SSOT; section/room forbid full translateX(100%)", () => {
    const css = readFileSync(resolve(root, "app/messenger-view-transitions.css"), "utf8");
    expect(css).toContain("--sam-messenger-home-section-enter-duration: 180ms");
    expect(css).toContain("--sam-messenger-room-enter-duration: 150ms");
    expect(css).toContain("--sam-messenger-room-exit-duration: 130ms");
    expect(css).toContain("--sam-messenger-call-enter-duration: 180ms");
    expect(css).toContain("--sam-messenger-call-peer-detail-enter-duration: 180ms");
    expect(css).toContain("--sam-messenger-pillar-list-enter-duration: 440ms");

    const sectionBlock = css.match(
      /@keyframes messenger-section-slide-forward \{[\s\S]*?\}\s*@keyframes messenger-section-slide-backward \{[\s\S]*?\}/
    )?.[0];
    expect(sectionBlock).toBeTruthy();
    expect(sectionBlock).not.toMatch(/translate3d\(100%/);
    expect(sectionBlock).not.toMatch(/translate3d\(-100%/);
    expect(sectionBlock).toMatch(/opacity/);

    const roomEnterBlock = css.match(/\.messenger-enter \{[\s\S]*?\}\s*\.messenger-enter-active \{[\s\S]*?\}/)?.[0];
    expect(roomEnterBlock).toBeTruthy();
    expect(roomEnterBlock).not.toMatch(/translate3d\(100%/);
    expect(roomEnterBlock).toMatch(/translate3d\(28px/);

    expect(css).toContain('[data-messenger-responsive-shell="wide"] .messenger-enter');
    expect(css).toMatch(
      /\[data-messenger-responsive-shell="wide"\] \.messenger-enter[\s\S]*?transform:\s*none\s*!important/
    );
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

  it("presentation density tokens separate friend/call/chat surfaces", () => {
    const css = readFileSync(resolve(root, "app/messenger-presentation.css"), "utf8");
    expect(css).toContain("--cm-list-row-min-h: 72px");
    expect(css).toContain("--cm-friend-row-min-h: 56px");
    expect(css).toContain("--cm-call-row-min-h: 64px");
    expect(css).toContain("--cm-list-avatar: 52px");
    expect(css).toContain("--cm-friend-avatar: 46px");
    expect(css).toContain("--cm-list-title-size: 15px");
    expect(css).toContain("--cm-list-unread-min: 20px");
    expect(css).toContain("--cm-call-redial: 48px");
    expect(css).toContain("--cm-list-row-selected");
    expect(css).toContain("font-size: 16px");
    expect(css).toContain(".cm-messenger-wallpaper");
    expect(css).toContain('[data-cm-list-surface="friend"]');
    expect(css).toContain('[data-cm-list-surface="call"]');
    expect(css).not.toContain("border-radius: 16px");
  });

  it("reduced-motion strips section/room durations", () => {
    const css = readFileSync(resolve(root, "app/messenger-view-transitions.css"), "utf8");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain(".messenger-section-anim-forward");
    expect(css).toContain("animation-duration: 1ms !important");
  });

  it("friend row drops large status badge; keeps @id on title and presence line", () => {
    const src = readFileSync(
      resolve(root, "components/community-messenger/friend-list/CommunityMessengerFriendRow.tsx"),
      "utf8"
    );
    expect(src).not.toContain("CommunityMessengerFriendStatusBadge");
    expect(src).toContain("CommunityMessengerFriendPresenceLine");
    expect(src).toContain("CommunityMessengerFriendPresenceDot");
    expect(src).toContain('data-cm-list-surface="friend"');
    expect(src).toContain("formatAtUsername");
  });

  it("general DM keeps stranger badge on line 2 preview, not title row badge chip", () => {
    const src = readFileSync(
      resolve(root, "components/community-messenger/MessengerChatListItem.tsx"),
      "utf8"
    );
    expect(src).toContain('data-cm-peer-not-friend=""');
    const strangerBlock = src.match(/\{showStrangerBadge \? \([\s\S]*?\) : null\}/);
    expect(strangerBlock?.[0] ?? "").toContain("data-cm-peer-not-friend");
    expect(src).not.toMatch(
      /CommunityMessengerChatTypeBadge[\s\S]{0,200}showStrangerBadge[\s\S]{0,120}cm_peer_badge_not_friend/
    );
  });

  it("call row keeps not-friend as small line-2 meta and 48dp redial", () => {
    const row = readFileSync(
      resolve(root, "components/community-messenger/call-history/CommunityMessengerCallRow.tsx"),
      "utf8"
    );
    const btn = readFileSync(
      resolve(root, "components/community-messenger/call-history/CommunityMessengerCallActionButton.tsx"),
      "utf8"
    );
    expect(row).toContain('data-cm-list-surface="call"');
    expect(row).toContain("cm_peer_badge_not_friend");
    expect(row).not.toMatch(/rounded-full bg-sam-surface-muted[\s\S]{0,80}cm_peer_badge_not_friend/);
    expect(btn).toContain('data-cm-call-redial=""');
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
