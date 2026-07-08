import { describe, expect, it, vi } from "vitest";
import { playMessengerMessageSentFeedbackOnce } from "@/lib/community-messenger/room/phase2/use-messenger-room-phase2-controller";

describe("playMessengerMessageSentFeedbackOnce", () => {
  it("plays messenger_message_sent once after successful ACK with confirmed id", () => {
    const play = vi.fn();
    const played = new Set<string>();

    expect(playMessengerMessageSentFeedbackOnce(played, "cid-1", "msg-1", play)).toBe(true);

    expect(play).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledWith("messenger_message_sent");
  });

  it("does not play for failed response without confirmed id", () => {
    const play = vi.fn();

    expect(playMessengerMessageSentFeedbackOnce(new Set(), "cid-1", null, play)).toBe(false);

    expect(play).not.toHaveBeenCalled();
  });

  it("does not play for network throw/offline path without ACK ids", () => {
    const play = vi.fn();

    expect(playMessengerMessageSentFeedbackOnce(new Set(), "cid-1", "", play)).toBe(false);

    expect(play).not.toHaveBeenCalled();
  });

  it("dedupes repeated ACK handling for the same clientMessageId", () => {
    const play = vi.fn();
    const played = new Set<string>();

    expect(playMessengerMessageSentFeedbackOnce(played, "cid-1", "msg-1", play)).toBe(true);
    expect(playMessengerMessageSentFeedbackOnce(played, "cid-1", "msg-1", play)).toBe(false);
    expect(playMessengerMessageSentFeedbackOnce(played, "cid-1", "msg-2", play)).toBe(false);

    expect(play).toHaveBeenCalledTimes(1);
  });
});
