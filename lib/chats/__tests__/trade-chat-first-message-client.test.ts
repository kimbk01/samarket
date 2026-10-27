/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearTradeChatFirstMessage,
  peekTradeChatFirstMessage,
  setTradeChatFirstMessage,
} from "@/lib/chats/trade-chat-first-message-client";

describe("trade chat first message (CTA-02)", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("keeps the typed text with a stable clientMessageId for the same product", () => {
    setTradeChatFirstMessage("p1", "  아직 판매 중인가요?  ");
    const a = peekTradeChatFirstMessage("p1");
    const b = peekTradeChatFirstMessage("p1");
    expect(a?.text).toBe("아직 판매 중인가요?");
    expect(a?.clientMessageId).toBeTruthy();
    expect(b?.clientMessageId).toBe(a?.clientMessageId);
  });

  it("never leaks to another product and expires after 5 minutes", () => {
    setTradeChatFirstMessage("p1", "hi");
    expect(peekTradeChatFirstMessage("p2")).toBeNull();
    expect(peekTradeChatFirstMessage("p1", Date.now() + 5 * 60 * 1000 + 1)).toBeNull();
    expect(peekTradeChatFirstMessage("p1")).toBeNull();
  });

  it("empty text clears any pending message (existing room path)", () => {
    setTradeChatFirstMessage("p1", "hi");
    setTradeChatFirstMessage("p1", "");
    expect(peekTradeChatFirstMessage("p1")).toBeNull();
    setTradeChatFirstMessage("p1", "hi");
    clearTradeChatFirstMessage();
    expect(peekTradeChatFirstMessage("p1")).toBeNull();
  });
});
