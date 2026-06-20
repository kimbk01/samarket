import { describe, expect, it } from "vitest";
import { resolveMessengerTimelineRowPaddingTopClass } from "@/lib/community-messenger/room/messenger-room-timeline-row-spacing";

describe("resolveMessengerTimelineRowPaddingTopClass", () => {
  it("keeps call_stub stack tight and reduces gap before text (Telegram service row)", () => {
    const stub = { messageType: "call_stub", createdAt: "2026-01-01T00:00:00.000Z", isMine: true };
    const text = { messageType: "text", createdAt: "2026-01-01T00:01:00.000Z", isMine: true };
    expect(
      resolveMessengerTimelineRowPaddingTopClass({
        item: stub,
        prev: null,
        isDayBoundary: false,
        showPeerName: false,
        isGroupRoom: false,
      })
    ).toBe("");
    expect(
      resolveMessengerTimelineRowPaddingTopClass({
        item: stub,
        prev: stub,
        isDayBoundary: false,
        showPeerName: false,
        isGroupRoom: false,
      })
    ).toBe("pt-1");
    expect(
      resolveMessengerTimelineRowPaddingTopClass({
        item: text,
        prev: stub,
        isDayBoundary: false,
        showPeerName: false,
        isGroupRoom: false,
      })
    ).toBe("pt-1.5");
  });
});
