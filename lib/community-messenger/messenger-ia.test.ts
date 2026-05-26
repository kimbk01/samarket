import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/i18n/runtime-app-language", () => ({
  getRuntimeAppLanguage: () => "ko" as const,
}));

import { messengerChatListEmptyMessage } from "@/lib/community-messenger/messenger-ia";
import { translate } from "@/lib/i18n/messages";

const ko = "ko" as const;

describe("messengerChatListEmptyMessage", () => {
  it("uses generic copy for non-trade/delivery kinds", () => {
    expect(messengerChatListEmptyMessage("all")).toBe(translate(ko, "cm_ia_empty_default"));
    expect(messengerChatListEmptyMessage("direct")).toBe(translate(ko, "cm_ia_empty_default"));
  });

  it("mentions store order and product trade bridges for trade", () => {
    const m = messengerChatListEmptyMessage("trade");
    expect(m).toContain("이 거래 열기");
    expect(m).toContain("이 주문 열기");
  });

  it("mentions delivery order path for delivery", () => {
    expect(messengerChatListEmptyMessage("delivery")).toContain("배달 주문 채팅");
  });
});
