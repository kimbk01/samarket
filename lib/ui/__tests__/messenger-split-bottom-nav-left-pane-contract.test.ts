import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  APP_BOTTOM_NAV_MESSENGER_SPLIT_LIST_CLASS,
  MESSENGER_SPLIT_LIST_PANE_WIDTH_CSS,
} from "@/lib/ui/messenger-split-pane-layout";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("messenger split BottomNav left-pane contract", () => {
  it("exposes shared list-pane width + BottomNav shell class", () => {
    expect(MESSENGER_SPLIT_LIST_PANE_WIDTH_CSS).toBe("clamp(360px, 35vw, 470px)");
    expect(APP_BOTTOM_NAV_MESSENGER_SPLIT_LIST_CLASS).toBe("app-bottom-nav-shell--messenger-split-list");
  });

  it("CSS constrains messenger-split BottomNav to list pane width", () => {
    const css = read("app/app-bottom-nav.css");
    expect(css).toContain(".app-bottom-nav-shell--messenger-split-list");
    expect(css).toContain("clamp(360px, 35vw, 470px)");
    expect(css).toContain("right: auto");
  });

  it("ConditionalAppShell applies messenger-split BottomNav class on wide messenger", () => {
    const src = read("components/layout/ConditionalAppShell.tsx");
    expect(src).toContain("APP_BOTTOM_NAV_MESSENGER_SPLIT_LIST_CLASS");
    expect(src).toContain("isMessengerSplitViewport");
  });

  it("trade/delivery pillar registers SplitTopBar chrome", () => {
    const segment = read("components/community-messenger/MessengerPillarChatsSegment.tsx");
    expect(segment).toContain("MessengerPillarSplitChrome");
    const chrome = read("components/community-messenger/MessengerPillarSplitChrome.tsx");
    expect(chrome).toContain("useRegisterMessengerSplitChrome");
    expect(chrome).toContain("nav_trade_chat_label");
    expect(chrome).toContain("nav_chat_order_compact");
  });
});
