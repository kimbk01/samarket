// @vitest-environment jsdom
/**
 * 2026-11-16 실기(Samsung, 운영 dcdd8aed0): 반응 「+」 피커의 검색창을 누르면 키보드가 올라오며 목록이 스크롤되고,
 * 「목록 스크롤 = 메뉴 닫기」 규칙에 걸려 메뉴가 닫혔다(녹화: 포커스 → 키보드 → 목록 스크롤 → 메뉴 사라짐).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isFocusInsideMessagePopover } from "@/components/community-messenger/room/phase2/CommunityMessengerRoomPhase2MessageTimeline";

describe("메뉴 안 입력칸 포커스 중에는 스크롤로 메뉴를 닫지 않는다", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("메뉴 안 검색창에 포커스 → true, 밖 입력창 → false", () => {
    document.body.innerHTML =
      '<div data-cm-message-popover=""><input id="in" /></div><textarea id="out"></textarea>';
    (document.getElementById("in") as HTMLInputElement).focus();
    expect(isFocusInsideMessagePopover()).toBe(true);
    (document.getElementById("out") as HTMLTextAreaElement).focus();
    expect(isFocusInsideMessagePopover()).toBe(false);
  });

  it("스크롤 닫기 처리와 메뉴 표시가 같은 표식을 쓴다", () => {
    const timeline = readFileSync(
      path.join(process.cwd(), "components/community-messenger/room/phase2/CommunityMessengerRoomPhase2MessageTimeline.tsx"),
      "utf8"
    );
    const popover = readFileSync(
      path.join(process.cwd(), "components/community-messenger/room/message/MessageLongPressPopover.tsx"),
      "utf8"
    );
    expect(timeline).toMatch(/if \(isFocusInsideMessagePopover\(\)\) return;\s+if \(v\.messageActionItem\) v\.setMessageActionItem\(null\);/);
    expect(popover).toContain('data-cm-message-popover=""');
  });
});
