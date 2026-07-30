import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MESSENGER_HOME_SECTION_ENTER_MS } from "@/lib/community-messenger/messenger-home-section-slide";
import {
  MESSENGER_LIST_ROOM_ENTER_MS,
  MESSENGER_LIST_ROOM_EXIT_MS,
  MESSENGER_PILLAR_LIST_ENTER_MS,
  MESSENGER_PILLAR_LIST_EXIT_MS,
} from "@/lib/community-messenger/messenger-list-room-slide";
import { MESSENGER_SPLIT_LIST_PANE_CLASS } from "@/lib/ui/messenger-split-pane-layout";

const root = resolve(process.cwd());

describe("messenger presentation contract", () => {
  it("section transition is ~180ms short slide+fade (Telegram band 150–250)", () => {
    expect(MESSENGER_HOME_SECTION_ENTER_MS).toBe(180);
    expect(MESSENGER_HOME_SECTION_ENTER_MS).toBeGreaterThanOrEqual(150);
    expect(MESSENGER_HOME_SECTION_ENTER_MS).toBeLessThanOrEqual(250);
  });

  it("room enter is 180ms — mobile bottom→top, wide left→right", () => {
    expect(MESSENGER_LIST_ROOM_ENTER_MS).toBe(180);
    expect(MESSENGER_LIST_ROOM_EXIT_MS).toBe(150);
  });

  it("wide list pane uses clamp(360px, 35vw, 470px)", () => {
    expect(MESSENGER_SPLIT_LIST_PANE_CLASS).toContain("clamp(360px,35vw,470px)");
    expect(MESSENGER_SPLIT_LIST_PANE_CLASS).toContain("max-w-[470px]");
    expect(MESSENGER_SPLIT_LIST_PANE_CLASS).not.toContain("38vw");
    expect(MESSENGER_SPLIT_LIST_PANE_CLASS).not.toContain("420px");
  });

  it("CSS durations match TS SSOT; room axes and pillar 90% push", () => {
    const css = readFileSync(resolve(root, "app/messenger-view-transitions.css"), "utf8");
    expect(css).toContain("--sam-messenger-home-section-enter-duration: 180ms");
    expect(css).toContain("--sam-messenger-room-enter-duration: 180ms");
    expect(css).toContain("--sam-messenger-room-exit-duration: 150ms");
    expect(css).toContain(`--sam-messenger-pillar-list-enter-duration: ${MESSENGER_PILLAR_LIST_ENTER_MS}ms`);
    expect(css).toContain(`--sam-messenger-pillar-list-exit-duration: ${MESSENGER_PILLAR_LIST_EXIT_MS}ms`);

    const roomEnterBlock = css.match(/\/\* 모바일\(세로\): 하→상 방 진입 \*\/\s*\.messenger-enter \{[\s\S]*?\}\s*\.messenger-enter-active \{[\s\S]*?\}/)?.[0];
    expect(roomEnterBlock).toBeTruthy();
    expect(roomEnterBlock).toMatch(/translate3d\(0,\s*24px,\s*0\)/);
    expect(roomEnterBlock).not.toMatch(/translate3d\(28px/);

    expect(css).toMatch(
      /\[data-messenger-responsive-shell="wide"\] \.messenger-enter \{[\s\S]*?translate3d\(-28px/
    );
    expect(css).toContain("messenger-room-enter-spinner");

    expect(css).toContain("sam-messenger-pillar-list-enter-rtl");
    expect(css).toContain("sam-messenger-pillar-list-exit-ltr");
    expect(css).toContain("translate3d(90%, 0, 0)");
    expect(css).not.toContain("sam-messenger-pillar-list-enter-ltr");
    expect(css).not.toMatch(/@keyframes sam-messenger-pillar-list-enter-rtl \{[\s\S]*?translate3d\(-100%/);
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

  it("reduced-motion strips section/room/pillar durations", () => {
    const css = readFileSync(resolve(root, "app/messenger-view-transitions.css"), "utf8");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain(".messenger-section-anim-forward");
    expect(css).toContain(".sam-messenger-pillar-list-exit");
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

  it("general DM keeps stranger badge on line 2 only when not friend", () => {
    const src = readFileSync(
      resolve(root, "components/community-messenger/MessengerChatListItem.tsx"),
      "utf8"
    );
    expect(src).toContain("showStrangerBadge");
    expect(src).toContain("!savedFriendIds.has");
    expect(src).toContain('data-cm-peer-not-friend=""');
    expect(src).not.toMatch(
      /CommunityMessengerChatTypeBadge[\s\S]{0,200}showStrangerBadge[\s\S]{0,120}cm_peer_badge_not_friend/
    );
  });

  it("call row: nick(@id), duration under redial, not-friend on line 2", () => {
    const row = readFileSync(
      resolve(root, "components/community-messenger/call-history/CommunityMessengerCallRow.tsx"),
      "utf8"
    );
    expect(row).toContain('data-cm-list-surface="call"');
    expect(row).toContain("(@{vm.peerPublicId})");
    expect(row).toContain("vm.durationLabel || timeLabel");
    expect(row).toContain("cm_peer_badge_not_friend");
    expect(row).not.toMatch(/rounded-full bg-sam-surface-muted[\s\S]{0,80}cm_peer_badge_not_friend/);
  });

  it("room swipe shell shows enter spinner during enter phases", () => {
    const src = readFileSync(
      resolve(root, "components/community-messenger/room/MessengerRoomSwipeBackShell.tsx"),
      "utf8"
    );
    expect(src).toContain("data-messenger-room-enter-spinner");
    expect(src).toContain("enterBusy");
    expect(src).toContain("Loader2");
  });

  it("pillar list pane wires enter/exit classes", () => {
    const src = readFileSync(
      resolve(root, "components/community-messenger/CommunityMessengerHomeListPane.tsx"),
      "utf8"
    );
    expect(src).toContain("sam-messenger-pillar-list-enter");
    expect(src).toContain("sam-messenger-pillar-list-exit");
    expect(src).toContain("MESSENGER_PILLAR_LIST_EXIT_MS");
  });

  it("AppStickyHeader skips messenger split to avoid double safe-top", () => {
    const src = readFileSync(resolve(root, "components/layout/AppStickyHeader.tsx"), "utf8");
    expect(src).toContain("isMessengerSplit && isCommunityMessengerSurface");
    expect(src).toContain("return null");
  });

  it("section tabs use underline + Starbucks primary, not pill chips", () => {
    const src = readFileSync(
      resolve(root, "components/community-messenger/MessengerHomeSectionTabs.tsx"),
      "utf8"
    );
    expect(src).toContain("rounded-ui-rect");
    expect(src).toContain("border-b-2");
    expect(src).toContain("border-sam-primary");
    expect(src).toContain("font-bold");
    expect(src).toContain('mainSection === "chats"');
    expect(src).not.toMatch(/SECTION_TAB_PILL|알약 탭/);
    expect(src).not.toMatch(/SECTION_TAB_UNDERLINE_FRAME[\s\S]*rounded-full/);
    expect(src).not.toContain("bg-sam-primary-soft font-bold text-sam-primary");
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
