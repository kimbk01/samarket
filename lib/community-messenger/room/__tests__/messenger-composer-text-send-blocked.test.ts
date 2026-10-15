import { describe, expect, it } from "vitest";
import { isComposerTextSendBlocked } from "@/lib/community-messenger/room/messenger-composer-text-send-blocked";

const base = { busy: null, roomUnavailable: false, draft: "hi" } as const;

describe("isComposerTextSendBlocked", () => {
  it("allows sending text when idle or while another text send is in flight", () => {
    expect(isComposerTextSendBlocked({ ...base })).toBe(false);
    expect(isComposerTextSendBlocked({ ...base, busy: "send" })).toBe(false);
  });

  it("blocks empty / whitespace drafts and unavailable rooms", () => {
    expect(isComposerTextSendBlocked({ ...base, draft: "" })).toBe(true);
    expect(isComposerTextSendBlocked({ ...base, draft: "  \n " })).toBe(true);
    expect(isComposerTextSendBlocked({ ...base, roomUnavailable: true })).toBe(true);
  });

  it.each(["send-image", "send-file", "send-sticker", "send-voice", "delete-message", "edit-message"])(
    "blocks while busy=%s (button disabled and commit guard agree)",
    (busy) => {
      expect(isComposerTextSendBlocked({ ...base, busy })).toBe(true);
    }
  );
});
