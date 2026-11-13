import { describe, expect, it } from "vitest";
import {
  DIBAY_DOMAIN_CHROME,
  DIBAY_TAB_DOMAIN_CHROME_IDS,
  isDibayChromeSharedPath,
  resolveDibayDomainChromeIdForPath,
  resolveDibayTabDomainForPath,
} from "@/lib/ui/dibay-domain-chrome";
import { resolveMainSurface } from "@/lib/layout/resolve-main-surface";
import {
  DIBAY_CATEGORY_RAIL_HOST_CLASS,
  DIBAY_CHROME_SECONDARY_HOST_CLASS,
  DIBAY_SECONDARY_TAB_ACTIVE_CLASS,
  DIBAY_SECONDARY_TAB_ROW_CLASS,
  DIBAY_SECONDARY_TAB_TRACK_CLASS,
  DIBAY_SECONDARY_TABS_CLASS,
  DIBAY_STATUS_TABS_CLASS,
  dibaySecondaryTabClass,
} from "@/lib/ui/dibay-secondary-tabs";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

/** Image SSOT lock — visual tokens only. */
describe("dibay global header + secondary tabs SSOT", () => {
  it("헤더 SSOT 3단계 — 하단 탭 5개 색(설계 §4-3 1안, Owner 「권장안대로」), 거래 색 없음", () => {
    expect(DIBAY_DOMAIN_CHROME.home.surface).toBe("#F3F5F3");
    expect(DIBAY_DOMAIN_CHROME.community.surface).toBe("#E3F1E7");
    expect(DIBAY_DOMAIN_CHROME.delivery.surface).toBe("#FDEEDC");
    expect(DIBAY_DOMAIN_CHROME.chat.surface).toBe("#E3EDFB");
    expect(DIBAY_DOMAIN_CHROME.mypage.surface).toBe("#EFEAF6");
    expect(Object.keys(DIBAY_DOMAIN_CHROME)).not.toContain("trade");
    expect(DIBAY_TAB_DOMAIN_CHROME_IDS).toEqual(["home", "community", "delivery", "chat", "mypage"]);
  });

  it("C1 색 = 하단 탭 판정(resolveMainSurface) — 거래·모임은 커뮤니티 탭 색", () => {
    expect(resolveDibayDomainChromeIdForPath("/")).toBe("home");
    expect(resolveDibayDomainChromeIdForPath("/home")).toBe("home");
    expect(resolveDibayDomainChromeIdForPath("/philife")).toBe("community");
    expect(resolveDibayDomainChromeIdForPath("/moim")).toBe("community");
    expect(resolveDibayDomainChromeIdForPath("/market")).toBe("community");
    expect(resolveDibayDomainChromeIdForPath("/market/vehicle")).toBe("community");
    expect(resolveDibayDomainChromeIdForPath("/post/abc")).toBe("community");
    expect(resolveDibayDomainChromeIdForPath("/write")).toBe("community");
    expect(resolveDibayDomainChromeIdForPath("/stores")).toBe("delivery");
    expect(resolveDibayDomainChromeIdForPath("/stores/browse/food")).toBe("delivery");
    expect(resolveDibayDomainChromeIdForPath("/orders")).toBe("delivery");
    expect(resolveDibayDomainChromeIdForPath("/chats")).toBe("chat");
    expect(resolveDibayDomainChromeIdForPath("/community-messenger")).toBe("chat");
    expect(resolveDibayDomainChromeIdForPath("/community-messenger/rooms/r1")).toBe("chat");
    expect(resolveDibayDomainChromeIdForPath("/group-chat/r1")).toBe("chat");
    expect(resolveDibayDomainChromeIdForPath("/group/token1")).toBe("chat");
    expect(resolveDibayDomainChromeIdForPath("/mypage")).toBe("mypage");
    expect(resolveDibayDomainChromeIdForPath("/mypage/section/settings")).toBe("mypage");
    expect(resolveDibayDomainChromeIdForPath("/users")).toBe("other");
    expect(resolveDibayDomainChromeIdForPath("/groups")).toBe("other");
    // 하단 탭 판정 자체는 바꾸지 않는다
    expect(resolveMainSurface("/notifications")).toBe("other");
    expect(resolveMainSurface("/group-chat/r1")).toBe("other");
  });

  it("C2 공용 화면 = 들어온 탭 색, 기록 없으면 내정보 색", () => {
    for (const p of ["/notifications", "/notifications/abc", "/search", "/settings/permissions", "/address/select", "/support/enter", "/u/someone"]) {
      expect(isDibayChromeSharedPath(p), p).toBe(true);
      expect(resolveDibayDomainChromeIdForPath(p), p).toBe("mypage");
      expect(resolveDibayDomainChromeIdForPath(p, "community"), p).toBe("community");
      expect(resolveDibayDomainChromeIdForPath(p, "delivery"), p).toBe("delivery");
    }
    expect(resolveDibayTabDomainForPath("/notifications")).toBeNull();
  });

  it("C5 keeps TS chrome table and CSS blocks identical (surface via --dibay-surface-*)", () => {
    const css = readFileSync(join(root, "app/dibay-chrome-ssot.css"), "utf8");
    const block = (id: string) => {
      const m = css.match(new RegExp(`\\[data-dibay-domain="${id}"\\]\\s*\\{([^}]*)\\}`));
      expect(m, id).not.toBeNull();
      return m![1];
    };
    const val = (body: string, name: string) =>
      body.match(new RegExp(`--dibay-domain-${name}:\\s*([^;]+);`))?.[1].trim().toLowerCase();
    expect(css).not.toContain('[data-dibay-domain="trade"]');
    for (const id of DIBAY_TAB_DOMAIN_CHROME_IDS) {
      const body = block(id);
      const t = DIBAY_DOMAIN_CHROME[id];
      expect(val(body, "surface"), `${id} surface`).toBe(`var(--dibay-surface-${id})`);
      const root = css.match(new RegExp(`--dibay-surface-${id}:\\s*([^;]+);`))?.[1].trim().toLowerCase();
      expect(root, `${id} root surface`).toBe(t.surface.toLowerCase());
      expect(val(body, "accent"), `${id} accent`).toBe(t.accent.toLowerCase());
      expect(val(body, "tab-idle-bg"), `${id} tab idle`).toBe(t.tabIdleBg.toLowerCase());
    }
  });

  it("C3 직접 그린 헤더 셸은 도메인 색 변수만 (하드코딩 배경 금지)", () => {
    const read = (rel: string) => readFileSync(join(root, rel), "utf8");
    expect(read("components/home-hub/HomeScreen.tsx")).not.toContain('<header className="bg-[#F3F5F3]"');
    expect(read("components/home-hub/HomeScreen.tsx")).toContain('dibayDomainChromeElementPropsForId("home")');
    const mirror = read("lib/design/delivery-browse-chrome.ts").match(/MIRROR_HEADER_SHELL_CLASS =\s*"([^"]+)"/)?.[1] ?? "";
    expect(mirror).toContain("bg-[color:var(--dibay-domain-surface)]");
    expect(mirror).not.toContain("bg-white");
    expect(read("app/chat-viewport-shell.css")).toContain("background: var(--dibay-surface-chat, var(--cm-room-header-bg, #ffffff));");
    /** C4 채팅방 상태바 — 바탕 무늬(background-image)에 덮이지 않게 안쪽 그림자로 칠한다 (운영 실측 FAIL 2026-11-13 정정) */
    const roomShell = read("app/chat-viewport-shell.css");
    expect(roomShell).toContain("box-shadow: inset 0 var(--safe-top) 0 0 var(--dibay-surface-chat);");
    expect(roomShell).not.toContain("linear-gradient(var(--dibay-surface-chat)");
    expect(read("components/layout/ConditionalAppShell.tsx")).toContain("<DibayDomainChromeRootSync />");
  });

  it("exposes secondary pill visual class contract", () => {
    expect(DIBAY_SECONDARY_TABS_CLASS).toBe("dibay-secondary-tabs");
    expect(dibaySecondaryTabClass(false)).toBe("dibay-secondary-tab");
    expect(dibaySecondaryTabClass(true)).toBe(DIBAY_SECONDARY_TAB_ACTIVE_CLASS);
    expect(DIBAY_SECONDARY_TAB_ACTIVE_CLASS).toContain("dibay-secondary-tab--active");
    expect(DIBAY_CHROME_SECONDARY_HOST_CLASS).toContain("--dibay-domain-surface");
    expect(DIBAY_STATUS_TABS_CLASS).toContain("dibay-status-tabs");
    expect(DIBAY_CATEGORY_RAIL_HOST_CLASS).toContain("dibay-category-rail-host");
    expect(DIBAY_CATEGORY_RAIL_HOST_CLASS).not.toMatch(/overflow-x-hidden/);
    expect(DIBAY_SECONDARY_TAB_ROW_CLASS).toContain("--dibay-secondary-tab-gap");
    expect(DIBAY_SECONDARY_TAB_TRACK_CLASS).toContain("px-0");
  });

  it("forbids trade wipe specialty class in trade-primary-tabs-classes", async () => {
    const { TRADE_PRIMARY_TAB_PILL_SHELL } = await import("@/lib/trade/ui/trade-primary-tabs-classes");
    expect(TRADE_PRIMARY_TAB_PILL_SHELL).toBe("dibay-secondary-tab");
    expect(TRADE_PRIMARY_TAB_PILL_SHELL).not.toContain("overflow-hidden");
  });

  it("community / trade / chat 2단 use DibaySecondaryTabRow and forbid gap-1 on row", () => {
    const community = readFileSync(join(root, "components/community/CommunityFeed.tsx"), "utf8");
    const trade = readFileSync(join(root, "components/trade/TradePrimaryTabs.tsx"), "utf8");
    const messenger = readFileSync(
      join(root, "components/community-messenger/MessengerHomeSectionTabs.tsx"),
      "utf8"
    );
    for (const [name, src] of [
      ["CommunityFeed", community],
      ["TradePrimaryTabs", trade],
      ["MessengerHomeSectionTabs", messenger],
    ] as const) {
      expect(src, name).toContain("DibaySecondaryTabRow");
      expect(src, name).not.toMatch(/gap-1(?![0-9])/);
    }
  });
});
