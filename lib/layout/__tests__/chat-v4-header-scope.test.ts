import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveMainTier1Subpage } from "@/lib/layout/resolve-main-tier1";
import { translate } from "@/lib/i18n/messages";

/**
 * 채팅 머리글 = 앱 공통 머리글 규칙 그대로 (Owner 2026-11-10 「모달 말고 채팅 머리글은 다른 도메인과 똑같이」 — 시안 4판 머리글 값 대신).
 * - 채팅 탭(대화·친구·통화): 커뮤니티·거래·내정보와 같은 허브 머리글(`RegionBarMainHubTier1`, 공통 허브 기하·17/600·52px).
 * - 채팅 하위 화면(거래 채팅·주문 채팅 목록·보관함): 공통 `DetailHeader` — 뒤로 48 · 제목 가운데 · 17/600.
 * 채팅 전용 머리글 크기·정렬 보정(22px 제목, 18px 왼쪽 제목, `data-chat-sub-header`)은 두지 않는다.
 */
const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

describe("채팅 머리글 — 공통 규칙", () => {
  it("채팅 전용 머리글 보정 CSS·표시가 없다", () => {
    const chromeCss = read("app/dibay-chrome-ssot.css");
    const sectorCss = read("app/sector-header.css");
    expect(chromeCss).not.toContain('[data-main-hub-header="chat"]');
    expect(chromeCss).not.toContain("[data-chat-sub-header]");
    expect(chromeCss).not.toMatch(/--sector-header-title-size:\s*(18|22)px/);
    expect(sectorCss).not.toContain("sector-header-bar--start-title");
    expect(sectorCss).toContain("--sector-header-title-size: 17px;");
    expect(sectorCss).toContain("--sector-header-title-weight: 600;");
  });

  it("채팅 허브는 다른 허브와 같은 허브 머리글(왼쪽 제목 공통 기하)", () => {
    const hub = read("components/layout/RegionBarMainHubTier1.tsx");
    expect(hub).toContain('<SectionHeader embedded titleAlign="left" title={title} rightSlot={rightSlot} />');
    expect(hub).not.toContain("data-main-hub-header");
  });

  it("하위 화면은 공통 DetailHeader(가운데 제목) — RegionBar 가 채팅 전용 정렬을 넘기지 않는다", () => {
    const bar = read("components/layout/RegionBar.tsx");
    expect(bar).not.toContain("data-chat-sub-header");
    expect(bar).not.toContain("titleAlign");
    const detail = read("components/layout/sector-header/DefaultHeader.tsx");
    expect(detail).not.toContain('"start"');
  });

  it("거래·주문 채팅 목록·보관함 = 하위 화면 머리글, 주문 제목은 「주문 채팅」", () => {
    const trade = resolveMainTier1Subpage("/community-messenger/trade-chats");
    const delivery = resolveMainTier1Subpage("/community-messenger/delivery-chats");
    const archive = resolveMainTier1Subpage("/community-messenger", "?section=archive");
    expect(trade?.titleText).toBe("nav_trade_chat_label");
    expect(delivery?.titleText).toBe("community_messenger_order_chats");
    expect(translate("ko", "community_messenger_order_chats")).toBe("주문 채팅");
    expect(archive?.titleText).toBe("nav_messenger_archive");
    expect(archive?.showHubQuickActions).toBe(false);
    for (const r of [trade, delivery, archive]) {
      expect(r).not.toHaveProperty("chatSubHeader");
    }
  });

  it("모바일 1단 제목 덮어쓰기도 같은 키를 쓴다", () => {
    const effects = read("lib/community-messenger/home/use-community-messenger-home-shell-effects.tsx");
    expect(effects).toContain('pillar === "delivery" ? "community_messenger_order_chats"');
  });
});
