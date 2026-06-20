import { describe, expect, it } from "vitest";
import { restoreMessengerRoomPrependScrollAnchor } from "@/lib/community-messenger/room/messenger-room-prepend-scroll-anchor";
import { MESSENGER_CALL_STUB_ROW_ESTIMATE_PX } from "@/lib/store-order-chat/messenger-timeline-row-estimate";

describe("restoreMessengerRoomPrependScrollAnchor", () => {
  it("restores scrollTop by prepended estimate when native scrollHeight lags", () => {
    let scrollTop = 120;
    const viewport = {
      scrollHeight: 400,
      get scrollTop() {
        return scrollTop;
      },
      set scrollTop(value: number) {
        scrollTop = value;
      },
    } as HTMLElement;

    const prepended = [
      { messageType: "call_stub" as const, content: "영상 통화 · 취소됨", metadata: {} },
      { messageType: "call_stub" as const, content: "음성 통화 · 부재중", metadata: {} },
    ];
    const expectedDelta = MESSENGER_CALL_STUB_ROW_ESTIMATE_PX * 2;

    const result = restoreMessengerRoomPrependScrollAnchor({
      viewport,
      virtualizer: {
        scrollOffset: 120,
        scrollToOffset: (offset: number) => {
          scrollTop = offset;
        },
      },
      prevScrollTop: 120,
      prevScrollHeight: 400,
      prependedMessages: prepended,
    });

    expect(result.heightDelta).toBe(expectedDelta);
    expect(viewport.scrollTop).toBe(120 + expectedDelta);
  });
});
