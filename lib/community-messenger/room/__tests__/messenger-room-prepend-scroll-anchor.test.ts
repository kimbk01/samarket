import { describe, expect, it } from "vitest";
import { restoreChatThreadPrependAnchor } from "@/lib/chat-thread-scroll/prepend-anchor";
import { MESSENGER_CALL_STUB_ROW_ESTIMATE_PX } from "@/lib/store-order-chat/messenger-timeline-row-estimate";

describe("restoreChatThreadPrependAnchor (CM prepend)", () => {
  it("restores scrollTop by estimated prepend px when native scrollHeight lags", () => {
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

    const expectedDelta = MESSENGER_CALL_STUB_ROW_ESTIMATE_PX * 2;

    const result = restoreChatThreadPrependAnchor({
      viewport,
      virtualizer: {
        scrollOffset: 120,
        scrollToOffset: (offset: number) => {
          scrollTop = offset;
        },
      },
      prevScrollTop: 120,
      prevScrollHeight: 400,
      estimatedPrependPx: expectedDelta,
    });

    expect(result.heightDelta).toBe(expectedDelta);
    expect(viewport.scrollTop).toBe(120 + expectedDelta);
  });
});
