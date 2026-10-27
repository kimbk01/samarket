import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  chatListScrollMargin,
  resolveChatListScrollElement,
} from "@/components/community-messenger/chat-list/CommunityMessengerChatList";

/**
 * LIST-V1 (10-27 11:13 Samsung): 대화 목록을 내리면 빈 화면 — 목록 상자 scrollTop 5307/6236 인데 그려진 행 20개.
 * 가상 목록이 문서 스크롤을 봤고, 실제 스크롤은 허브 목록 상자였다.
 */
describe("LIST-V1 가상 목록 스크롤 기준", () => {
  it("허브 목록 상자 안이면 그 상자를 스크롤 기준으로 쓴다", () => {
    const hub = { id: "hub" } as unknown as Element;
    const anchor = { closest: (sel: string) => (sel === "[data-messenger-hub-list-scroll]" ? hub : null) } as unknown as Element;
    expect(resolveChatListScrollElement(anchor)).toBe(hub);
  });

  it("목록 위 줄(검색·보관·묶음)만큼 가상 범위를 민다", () => {
    expect(chatListScrollMargin(400, 100, 0)).toBe(300);
    /** 스크롤해도 같은 값(상자 안 절대 위치) */
    expect(chatListScrollMargin(-900, 100, 1300)).toBe(300);
    expect(chatListScrollMargin(50, 100, 0)).toBe(0);
  });

  it("목록이 상자 기준 위치·여백으로 가상 행을 그린다", () => {
    const src = readFileSync("components/community-messenger/chat-list/CommunityMessengerChatList.tsx", "utf8");
    expect(src).toContain("getScrollElement = useCallback(() => resolveChatListScrollElement(listAnchorRef.current), [])");
    expect(src).toContain("scrollMargin,");
    expect(src).toContain("viStart={vi.start - virtualizer.options.scrollMargin}");
    expect(src).not.toContain("document.scrollingElement ?? document.documentElement) : null),\n    []");
  });

  it("허브 목록 상자 표시가 그대로 있다", () => {
    const sections = readFileSync("components/community-messenger/MessengerHomeMainSections.tsx", "utf8");
    expect(sections).toContain("data-messenger-hub-list-scroll");
  });
});
