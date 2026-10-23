import { describe, expect, it } from "vitest";
import {
  resolvePreferNewlineOnEnter,
  shouldSendOnEnterKey,
} from "@/lib/community-messenger/room/messenger-composer-enter-policy";

describe("K-1 messenger composer Enter policy", () => {
  it("prefers newline on native or coarse pointer (not width)", () => {
    expect(resolvePreferNewlineOnEnter({ isNativePlatform: true, coarsePointer: false })).toBe(true);
    expect(resolvePreferNewlineOnEnter({ isNativePlatform: false, coarsePointer: true })).toBe(true);
    expect(resolvePreferNewlineOnEnter({ isNativePlatform: false, coarsePointer: false })).toBe(false);
  });

  it("mobile/native: Enter does not send; Shift+Enter also does not send", () => {
    expect(
      shouldSendOnEnterKey({
        key: "Enter",
        shiftKey: false,
        isComposing: false,
        preferNewlineOnEnter: true,
      })
    ).toBe(false);
    expect(
      shouldSendOnEnterKey({
        key: "Enter",
        shiftKey: true,
        isComposing: false,
        preferNewlineOnEnter: true,
      })
    ).toBe(false);
  });

  it("desktop: Enter sends; Shift+Enter does not; IME composing never sends", () => {
    expect(
      shouldSendOnEnterKey({
        key: "Enter",
        shiftKey: false,
        isComposing: false,
        preferNewlineOnEnter: false,
      })
    ).toBe(true);
    expect(
      shouldSendOnEnterKey({
        key: "Enter",
        shiftKey: true,
        isComposing: false,
        preferNewlineOnEnter: false,
      })
    ).toBe(false);
    expect(
      shouldSendOnEnterKey({
        key: "Enter",
        shiftKey: false,
        isComposing: true,
        preferNewlineOnEnter: false,
      })
    ).toBe(false);
    expect(
      shouldSendOnEnterKey({
        key: "a",
        shiftKey: false,
        isComposing: false,
        preferNewlineOnEnter: false,
      })
    ).toBe(false);
  });
});
