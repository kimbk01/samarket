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
    expect(css).toContain("min-width: 360px");
  });

  it("messenger-split BottomNav left tracks APP_MAIN_COLUMN mx-auto max-w chain", () => {
    const css = read("app/app-bottom-nav.css");
    const layout = read("lib/ui/app-content-layout.ts");
    expect(layout).toContain("max-w-[52rem]");
    expect(layout).toContain("lg:max-w-[60rem]");
    expect(layout).toContain("xl:max-w-[66rem]");
    // fixed bodyPortal nav must not use bare left:0 under split (list inset FAIL)
    expect(css).toContain("calc((100vw - min(100vw, 52rem)) / 2)");
    expect(css).toContain("calc((100vw - min(100vw, 60rem)) / 2)");
    expect(css).toContain("calc((100vw - min(100vw, 66rem)) / 2)");
    expect(css).toContain("APP_MAIN_COLUMN_MAX_WIDTH_CLASS");
  });

  it("ConditionalAppShell applies messenger-split BottomNav class on messenger path (SSR-safe)", () => {
    const src = read("components/layout/ConditionalAppShell.tsx");
    expect(src).toContain("APP_BOTTOM_NAV_MESSENGER_SPLIT_LIST_CLASS");
    expect(src).toContain('pathname === "/community-messenger"');
    expect(src).toContain("Avoids SSR false");
    expect(src).not.toMatch(
      /isMessengerSplitViewport\s*&&\s*\n?\s*\(pathname === "\/community-messenger"/
    );
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
