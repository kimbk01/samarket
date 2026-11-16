import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MESSENGER_HOME_SPLIT_LIST_SHEET_CLASS,
  MESSENGER_SPLIT_LIST_PANE_WIDTH_CSS,
} from "@/lib/ui/messenger-split-pane-layout";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("messenger split left-pane contract (APK/iOS/Windows/tablet viewport SSOT)", () => {
  it("exposes shared list-pane width + home sheet class", () => {
    expect(MESSENGER_SPLIT_LIST_PANE_WIDTH_CSS).toBe("clamp(360px, 35vw, 470px)");
    expect(MESSENGER_HOME_SPLIT_LIST_SHEET_CLASS).toBe("messenger-home-bottom-sheet-panel--split-list");
  });

  it("v6 R2-5 — BottomNav 는 메신저에서도 창 전체 폭 (좌측 칸 폭 규칙 없음)", () => {
    const css = read("app/app-bottom-nav.css");
    const layout = read("lib/ui/messenger-split-pane-layout.ts");
    expect(css).not.toMatch(/\.app-bottom-nav-shell\.app-bottom-nav-shell--messenger-split-list \{/);
    expect(layout).not.toContain("export const APP_BOTTOM_NAV_MESSENGER_SPLIT_LIST_CLASS");
  });

  it("v6 R2-5 — 분할 방 칸은 하단 탭 높이만큼 아래 여백 (세로 메뉴·키보드 숨김 때는 없음)", () => {
    const css = read("app/app-bottom-nav.css");
    expect(css).toContain(
      "html[data-shell-bottom-nav]:not([data-shell-bottom-nav-side-rail]):not([data-shell-bottom-nav-keyboard-hidden])"
    );
    expect(css).toContain(":is([data-messenger-split-room-pane], [data-messenger-split-call-peer-pane])");
    expect(css).toContain("padding-bottom: var(--app-bottom-nav-clearance);");
    const flags = read("lib/layout/html-shell-flags.ts");
    expect(flags).toContain('set("data-shell-bottom-nav-keyboard-hidden", navHas("app-bottom-nav-shell--keyboard-hidden"));');
  });

  it("ConditionalAppShell marks keyboard-hidden nav and no longer narrows messenger BottomNav", () => {
    const src = read("components/layout/ConditionalAppShell.tsx");
    expect(src).toContain("bottomNavKeyboardHidden ? BOTTOM_NAV_KEYBOARD_HIDDEN_CLASS");
    expect(src).not.toMatch(/\? APP_BOTTOM_NAV_MESSENGER_SPLIT_LIST_CLASS/);
    expect(src).not.toMatch(/Capacitor|isTablet|platform\.os/i);
  });

  it("home sheet shell keeps inset-x-0; width shrink is CSS ≥768 only", () => {
    const sheet = read("components/community-messenger/MessengerSheetUi.tsx");
    const css = read("app/messenger-home-bottom-sheet.css");
    expect(sheet).toContain("absolute inset-x-0 w-full");
    expect(sheet).not.toContain('panelPositionClass = center');
    expect(sheet).not.toMatch(/splitListSheet\s*\?\s*["']absolute bottom-0/);
    expect(css).toContain(".messenger-home-bottom-sheet-panel--split-list");
    expect(css).toContain("left: var(--safe-left, 0px) !important");
    expect(css).toContain("right: auto !important");
    expect(css).toContain("width: var(--cm-split-list-pane-width) !important");
  });

  it("group create outer sheet shares split-list class (보관함·채팅 설정은 시트가 아니라 하위 화면 — 채팅 시안 4판 「4」「7」)", () => {
    const home = read("components/community-messenger/CommunityMessengerHome.tsx");
    const settings = read("components/community-messenger/MessengerSettingsScreen.tsx");
    const archive = read("components/community-messenger/MessengerArchiveScreen.tsx");
    expect(home).toContain("MESSENGER_HOME_SPLIT_LIST_SHEET_CLASS");
    expect(home).toContain('data-cm-group-create-outer-chrome=""');
    expect(settings).not.toContain("MessengerHomeBottomSheetShell");
    expect(archive).not.toContain("MessengerHomeBottomSheetShell");
  });

  it("wide room header safe-top override lives after fixed header-height lock (presentation, 헤더 SSOT 52)", () => {
    const css = read("app/messenger-presentation.css");
    const lockIdx = css.indexOf("max-height: var(--sector-header-h) !important");
    const wideIdx = css.indexOf("min-height: calc(var(--sector-header-h) + var(--safe-top, 0px))");
    expect(lockIdx).toBeGreaterThan(-1);
    expect(wideIdx).toBeGreaterThan(lockIdx);
    expect(css).toContain("padding-right: var(--sector-header-edge-pad-right) !important;");
  });

  it("trade/delivery pillar registers SplitTopBar chrome", () => {
    /** 채팅 시안 4판: 머리글(분할 제목·뒤로 + 「모두 읽음」)은 안 읽은 방을 가진 목록 gate 가 등록 */
    for (const gate of [
      "components/community-messenger/domain-shell-canary/DomainTradeListCanaryGate.tsx",
      "components/community-messenger/domain-shell-canary/DomainStoreOrderCustomerListCanaryGate.tsx",
    ]) {
      expect(read(gate)).toContain("useMessengerPillarHeaderChrome(");
    }
    const chrome = read("components/community-messenger/MessengerPillarSplitChrome.tsx");
    expect(chrome).toContain("useRegisterMessengerSplitChrome");
    expect(chrome).toContain("nav_trade_chat_label");
    /** 「주문 채팅」(띄어 씀) — 모바일 1단 제목과 같은 키 */
    expect(chrome).toContain("community_messenger_order_chats");
    expect(chrome).not.toContain("nav_chat_order_compact");
  });
});
