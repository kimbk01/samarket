import { describe, expect, it } from "vitest";
import { translate } from "@/lib/i18n/messages";
import { tradeChatListStatusBadgePresentation } from "@/lib/community-messenger/trade-chat-list/trade-chat-list-status-badge";

const t = (key: Parameters<typeof translate>[1]) => translate("ko", key);

describe("tradeChatListStatusBadgePresentation", () => {
  it("maps inquiry to green filled badge", () => {
    const badge = tradeChatListStatusBadgePresentation("inquiry", t);
    expect(badge.label).toBe("판매중");
    expect(badge.className).toContain("bg-[#006241]");
    expect(badge.className).toContain("text-white");
  });

  it("maps negotiating to outlined green badge", () => {
    const badge = tradeChatListStatusBadgePresentation("negotiating", t);
    expect(badge.label).toBe("문의중");
    expect(badge.className).toContain("border-[#006241]");
  });

  it("maps reserved to amber badge", () => {
    const badge = tradeChatListStatusBadgePresentation("reserved", t);
    expect(badge.label).toBe("예약중");
    expect(badge.className).toContain("bg-[#FFF7E6]");
  });

  it("maps completed to muted badge", () => {
    const badge = tradeChatListStatusBadgePresentation("completed", t);
    expect(badge.label).toBe("판매완료");
    expect(badge.className).toContain("bg-[#F3F4F6]");
  });
});
