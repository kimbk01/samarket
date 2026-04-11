import { describe, expect, it } from "vitest";
import { messengerChatListEmptyMessage } from "@/lib/community-messenger/messenger-ia";

describe("messengerChatListEmptyMessage", () => {
  it("uses generic copy for non-trade/delivery kinds", () => {
    expect(messengerChatListEmptyMessage("all")).toBe("조건에 맞는 대화가 없습니다.");
    expect(messengerChatListEmptyMessage("direct")).toBe("조건에 맞는 대화가 없습니다.");
  });

  it("mentions store order bridge for trade", () => {
    expect(messengerChatListEmptyMessage("trade")).toContain("SAMessenger에서 이 주문 열기");
  });

  it("mentions delivery order path for delivery", () => {
    expect(messengerChatListEmptyMessage("delivery")).toContain("배달 주문 채팅");
  });
});
