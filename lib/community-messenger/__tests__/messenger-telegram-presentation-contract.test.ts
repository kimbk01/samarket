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

describe("messenger telegram presentation contract", () => {
  it("section transition is short fade window (160–200ms)", () => {
    expect(MESSENGER_HOME_SECTION_ENTER_MS).toBeGreaterThanOrEqual(160);
    expect(MESSENGER_HOME_SECTION_ENTER_MS).toBeLessThanOrEqual(200);
  });

  it("mobile room enter/exit are Telegram-short (not 100vw 440ms)", () => {
    expect(MESSENGER_LIST_ROOM_ENTER_MS).toBeGreaterThanOrEqual(80);
    expect(MESSENGER_LIST_ROOM_ENTER_MS).toBeLessThanOrEqual(120);
    expect(MESSENGER_LIST_ROOM_EXIT_MS).toBeGreaterThanOrEqual(70);
    expect(MESSENGER_LIST_ROOM_EXIT_MS).toBeLessThanOrEqual(110);
  });

  it("wide list pane uses clamp(360px, 35vw, 470px)", () => {
    expect(MESSENGER_SPLIT_LIST_PANE_CLASS).toContain("clamp(360px,35vw,470px)");
    expect(MESSENGER_SPLIT_LIST_PANE_CLASS).toContain("max-w-[470px]");
    expect(MESSENGER_SPLIT_LIST_PANE_CLASS).not.toContain("38vw");
    expect(MESSENGER_SPLIT_LIST_PANE_CLASS).not.toContain("420px");
  });

  it("CSS durations match TS SSOT and forbid full-width section/room slide", () => {
    const css = readFileSync(resolve(root, "app/messenger-view-transitions.css"), "utf8");
    expect(css).toContain("--sam-messenger-home-section-enter-duration: 180ms");
    expect(css).toContain("--sam-messenger-room-enter-duration: 100ms");
    expect(css).toContain("--sam-messenger-room-exit-duration: 90ms");
    expect(css).toContain("--sam-messenger-call-enter-duration: 180ms");
    expect(css).toContain("--sam-messenger-call-peer-detail-enter-duration: 180ms");
    expect(css).toContain("--sam-messenger-pillar-list-enter-duration: 180ms");
    expect(css).toContain("translate3d(10px, 0, 0)");
    expect(css).toContain("translate3d(12px, 0, 0)");
    expect(css).not.toMatch(/messenger-section-slide-forward[\s\S]*translate3d\(100%/);
    expect(css).not.toMatch(/\.messenger-enter \{\s*transform: translate3d\(100%/);
    expect(css).not.toMatch(/\.messenger-call-enter \{\s*transform: translate3d\(100%/);
    expect(css).not.toMatch(/sam-messenger-call-peer-detail-enter[\s\S]*translate3d\(100%/);
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
});
