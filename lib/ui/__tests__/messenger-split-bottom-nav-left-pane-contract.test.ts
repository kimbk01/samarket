import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MESSENGER_SPLIT_LIST_PANE_WIDTH_CSS } from "@/lib/ui/messenger-split-pane-layout";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("messenger split list pane + BottomNav global width contract", () => {
  it("exposes list-pane width SSOT (master only)", () => {
    expect(MESSENGER_SPLIT_LIST_PANE_WIDTH_CSS).toBe("clamp(360px, 35vw, 470px)");
  });

  it("master-detail list pane still uses split width class", () => {
    const md = read("components/community-messenger/home/CommunityMessengerHomeMasterDetail.tsx");
    expect(md).toContain("MESSENGER_SPLIT_LIST_PANE_BORDER_CLASS");
    const layout = read("lib/ui/messenger-split-pane-layout.ts");
    expect(layout).toContain("min-[768px]:w-[clamp(360px,35vw,470px)]");
  });

  it("BottomNav CSS does not constrain messenger to list-pane width", () => {
    const css = read("app/app-bottom-nav.css");
    expect(css).not.toContain("app-bottom-nav-shell--messenger-split-list");
    expect(css).not.toContain("--cm-split-list-pane-width");
    expect(css).toMatch(/viewport 전폭|전폭 \(max-width 금지\)/);
  });

  it("ConditionalAppShell does not apply messenger-split BottomNav width class", () => {
    const src = read("components/layout/ConditionalAppShell.tsx");
    expect(src).not.toContain("APP_BOTTOM_NAV_MESSENGER_SPLIT_LIST_CLASS");
    expect(src).not.toContain("app-bottom-nav-shell--messenger-split-list");
    expect(src).toContain("BottomNav");
  });

  it("messenger-split-pane-layout no longer exports BottomNav split-list class", () => {
    const layout = read("lib/ui/messenger-split-pane-layout.ts");
    expect(layout).not.toContain("APP_BOTTOM_NAV_MESSENGER_SPLIT_LIST_CLASS");
    expect(layout).not.toContain("app-bottom-nav-shell--messenger-split-list");
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
