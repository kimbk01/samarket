import { describe, expect, it } from "vitest";
import { getSwipeActions } from "@/lib/messenger-policy/chat-room-swipe-actions";

/**
 * 모임 R5 A8 — 채팅 목록 스와이프 「나가기」가 모임 방(판정 중·실패 포함)에 보이지 않는다.
 * 고치기 전: getSwipeActions 에 모임 입력이 없어 모임 방도 leave 가 나왔다(확인창 「그룹 나가기」 → 서버 409).
 */
describe("A8 모임 방 스와이프 나가기 없음", () => {
  const kinds = (input: Parameters<typeof getSwipeActions>[0]) => getSwipeActions(input).map((a) => a.kind);

  it("기본 목록: moimManaged=true 면 보관·읽음만 / false 면 그대로 나가기 있음", () => {
    expect(kinds({ policyType: "group", listContext: "default", moimManaged: true })).toEqual(["archive", "read"]);
    expect(kinds({ policyType: "group", listContext: "default", moimManaged: false })).toEqual(["archive", "read", "leave"]);
    expect(kinds({ policyType: "group", listContext: "default" })).toEqual(["archive", "read", "leave"]);
  });

  it("오픈채팅·주문 갈래도 같은 omitLeave", () => {
    expect(kinds({ policyType: "group", listContext: "open_chat", moimManaged: true })).toEqual(["read"]);
    expect(kinds({ policyType: "group", listContext: "default", storeOrderCustomerList: true, moimManaged: true })).toEqual(["read"]);
    expect(kinds({ policyType: "group", listContext: "archive", moimManaged: true })).toEqual(["archive", "read"]);
  });
});
