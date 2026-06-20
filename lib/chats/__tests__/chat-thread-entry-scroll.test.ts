/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { runChatThreadEntryScrollToBottom } from "@/lib/chats/chat-thread-entry-scroll";

describe("chat-thread-entry-scroll", () => {
  it("sets scrollTop to scrollHeight with double rAF", () => {
    vi.stubGlobal(
      "requestAnimationFrame",
      (cb: FrameRequestCallback) => {
        cb(0);
        return 0;
      }
    );

    const el = document.createElement("div");
    Object.defineProperty(el, "scrollHeight", { value: 2400 });
    Object.defineProperty(el, "scrollTop", { value: 0, writable: true });

    runChatThreadEntryScrollToBottom(el);
    expect(el.scrollTop).toBe(2400);
  });
});
