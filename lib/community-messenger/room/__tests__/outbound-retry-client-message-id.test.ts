import { beforeEach, describe, expect, it } from "vitest";
import {
  clearMessengerOutboundRetry,
  messengerOutboundRetryKey,
  rememberMessengerOutboundAmbiguousFailure,
  resetMessengerOutboundRetryForTests,
  resolveMessengerOutboundClientMessageId,
} from "@/lib/community-messenger/room/outbound-retry-client-message-id";

describe("outbound retry clientMessageId (M-5)", () => {
  beforeEach(() => resetMessengerOutboundRetryForTests());
  it("reuses the cid after an ambiguous failure for the same room+content", () => {
    const key = messengerOutboundRetryKey("R1", "text", "hello");
    let n = 0;
    const create = () => `cid-${++n}`;
    const first = resolveMessengerOutboundClientMessageId(key, create);
    rememberMessengerOutboundAmbiguousFailure(key, first);
    expect(resolveMessengerOutboundClientMessageId(key, create)).toBe(first);
  });
  it("issues a fresh cid after clear or for different content", () => {
    const key = messengerOutboundRetryKey("R1", "text", "hello");
    let n = 0;
    const create = () => `cid-${++n}`;
    rememberMessengerOutboundAmbiguousFailure(key, "cid-x");
    clearMessengerOutboundRetry(key);
    expect(resolveMessengerOutboundClientMessageId(key, create)).toBe("cid-1");
    rememberMessengerOutboundAmbiguousFailure(key, "cid-y");
    expect(resolveMessengerOutboundClientMessageId(messengerOutboundRetryKey("R1", "text", "other"), create)).toBe("cid-2");
  });
});
