import { describe, expect, it } from "vitest";
import { insertEmojiIntoComposerText } from "@/lib/community-messenger/room/messenger-composer-emoji-insert";

describe("K-4 insertEmojiIntoComposerText", () => {
  it("inserts at caret", () => {
    expect(insertEmojiIntoComposerText({ current: "ab", emoji: "😀", selectionStart: 1, selectionEnd: 1 })).toEqual({
      next: "a😀b",
      caret: 3,
    });
  });

  it("replaces selection", () => {
    expect(insertEmojiIntoComposerText({ current: "hello", emoji: "!", selectionStart: 1, selectionEnd: 4 })).toEqual({
      next: "h!o",
      caret: 2,
    });
  });

  it("appends when caret missing", () => {
    expect(insertEmojiIntoComposerText({ current: "hi", emoji: "👋" })).toEqual({
      next: "hi👋",
      caret: 4,
    });
  });
});
