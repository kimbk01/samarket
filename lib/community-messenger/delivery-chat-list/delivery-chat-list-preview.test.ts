import { describe, expect, it } from "vitest";
import { translate } from "@/lib/i18n/messages";
import type { MessageKey } from "@/lib/i18n/messages";
import { buildDeliveryChatListPreviewLine } from "@/lib/community-messenger/delivery-chat-list/delivery-chat-list-preview";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";

const t = (key: MessageKey) => translate("ko", key);

describe("buildDeliveryChatListPreviewLine", () => {
  it("uses bootstrap preview when no realtime message", () => {
    expect(buildDeliveryChatListPreviewLine({ listPreview: "안녕하세요", storeName: "카페", lastClientMessage: null, t })).toBe(
      "안녕하세요"
    );
  });

  it("prefers realtime last message", () => {
    const msg = {
      messageType: "text",
      content: "배달 시작",
      isMine: false,
    } as CommunityMessengerMessage;
    expect(
      buildDeliveryChatListPreviewLine({
        listPreview: "옛날 메시지",
        storeName: "카페 A",
        lastClientMessage: msg,
        t,
      })
    ).toContain("배달 시작");
  });
});
