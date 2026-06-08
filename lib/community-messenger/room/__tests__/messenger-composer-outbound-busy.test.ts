import { describe, expect, it } from "vitest";
import { isMessengerComposerOutboundBusy } from "@/lib/community-messenger/room/messenger-composer-outbound-busy";

describe("isMessengerComposerOutboundBusy", () => {
  it("blocks all outbound composer operations while busy", () => {
    expect(isMessengerComposerOutboundBusy(null)).toBe(false);
    expect(isMessengerComposerOutboundBusy("send")).toBe(false);
    expect(isMessengerComposerOutboundBusy("send-sticker")).toBe(true);
    expect(isMessengerComposerOutboundBusy("send-image")).toBe(true);
    expect(isMessengerComposerOutboundBusy("edit-message")).toBe(true);
  });
});
