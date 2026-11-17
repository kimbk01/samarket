import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetMessengerBottomChatUnreadForTest,
  applyMessengerBottomChatUnread,
  getMessengerBottomChatUnreadCount,
  hasMessengerBottomChatUnreadApplied,
  resetMessengerBottomChatUnreadForAuthEpoch,
  subscribeMessengerBottomChatUnread,
} from "@/lib/notifications/messenger-bottom-chat-unread-projection";

describe("messenger-bottom-chat-unread-projection", () => {
  beforeEach(() => {
    __resetMessengerBottomChatUnreadForTest();
  });

  it("starts at 0 and applies General+Group room count only", () => {
    expect(getMessengerBottomChatUnreadCount()).toBe(0);
    applyMessengerBottomChatUnread(2);
    expect(getMessengerBottomChatUnreadCount()).toBe(2);
  });

  it("floors and clamps non-finite input", () => {
    applyMessengerBottomChatUnread(3.9);
    expect(getMessengerBottomChatUnreadCount()).toBe(3);
    applyMessengerBottomChatUnread(-1);
    expect(getMessengerBottomChatUnreadCount()).toBe(0);
  });

  it("does not notify when value is unchanged", () => {
    const onChange = vi.fn();
    subscribeMessengerBottomChatUnread(onChange);
    applyMessengerBottomChatUnread(1);
    applyMessengerBottomChatUnread(1);
    applyMessengerBottomChatUnread(1);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("notifies once per distinct value", () => {
    const onChange = vi.fn();
    subscribeMessengerBottomChatUnread(onChange);
    applyMessengerBottomChatUnread(1);
    applyMessengerBottomChatUnread(2);
    applyMessengerBottomChatUnread(2);
    applyMessengerBottomChatUnread(0);
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it("F3-a: first apply marks applied and notifies even when the value is 0; auth epoch reset clears it", () => {
    const onChange = vi.fn();
    subscribeMessengerBottomChatUnread(onChange);
    expect(hasMessengerBottomChatUnreadApplied()).toBe(false);
    applyMessengerBottomChatUnread(0);
    expect(hasMessengerBottomChatUnreadApplied()).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(1);
    applyMessengerBottomChatUnread(0);
    expect(onChange).toHaveBeenCalledTimes(1);
    resetMessengerBottomChatUnreadForAuthEpoch();
    expect(hasMessengerBottomChatUnreadApplied()).toBe(false);
    expect(getMessengerBottomChatUnreadCount()).toBe(0);
  });
});
