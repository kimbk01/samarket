import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { shouldCloseSwipeRowOnParentChange } from "@/components/community-messenger/MessengerChatListItem";

/**
 * L-4·L-5 (10-27 Samsung 실기기): 밀어 연 행이 뒤로·화면 이탈·바깥 탭·스크롤에도 열린 채 남았다
 * (행 translate3d(-234px) 유지). 부모는 openedSwipeItemId → null 로 닫는데 행은 「다른 행 id」 일 때만 닫았다.
 */
describe("L-4·L-5 부모의 「모두 닫기」가 열린 행에 반영된다", () => {
  it("이 행이 열려 있다가 부모가 null 로 닫으면 닫는다", () => {
    expect(shouldCloseSwipeRowOnParentChange("row-a", null, "row-a", false)).toBe(true);
  });

  it("다른 행이 열리면 닫는다(기존 동작)", () => {
    expect(shouldCloseSwipeRowOnParentChange(null, "row-b", "row-a", false)).toBe(true);
    expect(shouldCloseSwipeRowOnParentChange("row-a", "row-b", "row-a", false)).toBe(true);
  });

  it("이 행이 열리는 신호·무관한 행의 닫힘에는 그대로 둔다", () => {
    expect(shouldCloseSwipeRowOnParentChange(null, "row-a", "row-a", false)).toBe(false);
    expect(shouldCloseSwipeRowOnParentChange("row-b", null, "row-a", false)).toBe(false);
  });

  it("끄는 중(드래그)이면 손가락 위치가 우선", () => {
    expect(shouldCloseSwipeRowOnParentChange("row-a", null, "row-a", true)).toBe(false);
  });

  it("행 효과가 이 판정과 이전 값 기록을 쓴다", () => {
    const src = readFileSync("components/community-messenger/MessengerChatListItem.tsx", "utf8");
    expect(src).toContain("prevOpenedSwipeItemIdRef.current = openedSwipeItemId;");
    expect(src).toContain("shouldCloseSwipeRowOnParentChange(prev, openedSwipeItemId, swipeItemId, dragRef.current.dragging)");
  });
});
