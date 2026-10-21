import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isComposerKeyEventComposing,
  isMessengerComposerMobileInputEnvironment,
  nextMentionActiveIndex,
  resolveMessengerComposerKeyAction,
} from "@/lib/community-messenger/room/messenger-composer-keyboard-policy";

const desktop = { mobile: false, mentionOpen: false };
const mobile = { mobile: true, mentionOpen: false };

describe("K-1 (D3) Enter policy", () => {
  it("desktop: Enter sends, Shift+Enter is newline", () => {
    expect(resolveMessengerComposerKeyAction({ key: "Enter" }, desktop)).toEqual({ kind: "send" });
    expect(resolveMessengerComposerKeyAction({ key: "NumpadEnter" }, desktop)).toEqual({ kind: "send" });
    expect(resolveMessengerComposerKeyAction({ key: "Enter", shiftKey: true }, desktop)).toEqual({ kind: "none" });
  });
  it("mobile: Enter never sends (newline default)", () => {
    expect(resolveMessengerComposerKeyAction({ key: "Enter" }, mobile)).toEqual({ kind: "none" });
    expect(resolveMessengerComposerKeyAction({ key: "Enter", shiftKey: true }, mobile)).toEqual({ kind: "none" });
  });
  it("other keys do nothing", () => {
    expect(resolveMessengerComposerKeyAction({ key: "a" }, desktop)).toEqual({ kind: "none" });
  });
});

describe("K-6 / K-7(S) IME composing", () => {
  it("isComposing, keyCode 229 or tracked composition blocks send", () => {
    expect(isComposerKeyEventComposing({ key: "Enter", isComposing: true })).toBe(true);
    expect(isComposerKeyEventComposing({ key: "Enter", keyCode: 229 })).toBe(true);
    expect(isComposerKeyEventComposing({ key: "Enter" }, true)).toBe(true);
    expect(isComposerKeyEventComposing({ key: "Enter", keyCode: 13 })).toBe(false);
    expect(resolveMessengerComposerKeyAction({ key: "Enter", keyCode: 229 }, desktop)).toEqual({ kind: "none" });
    expect(
      resolveMessengerComposerKeyAction({ key: "Enter" }, { ...desktop, compositionActive: true })
    ).toEqual({ kind: "none" });
  });
});

describe("K-7 mention keyboard navigation", () => {
  const open = { mobile: false, mentionOpen: true };
  it("arrows move, Enter/Tab pick, Escape closes", () => {
    expect(resolveMessengerComposerKeyAction({ key: "ArrowDown" }, open)).toEqual({ kind: "mention_move", delta: 1 });
    expect(resolveMessengerComposerKeyAction({ key: "ArrowUp" }, open)).toEqual({ kind: "mention_move", delta: -1 });
    expect(resolveMessengerComposerKeyAction({ key: "Enter" }, open)).toEqual({ kind: "mention_pick" });
    expect(resolveMessengerComposerKeyAction({ key: "Tab" }, open)).toEqual({ kind: "mention_pick" });
    expect(resolveMessengerComposerKeyAction({ key: "Escape" }, open)).toEqual({ kind: "mention_close" });
  });
  it("mobile Enter picks mention when list open", () => {
    expect(resolveMessengerComposerKeyAction({ key: "Enter" }, { mobile: true, mentionOpen: true })).toEqual({
      kind: "mention_pick",
    });
  });
  it("composing Enter does not pick", () => {
    expect(resolveMessengerComposerKeyAction({ key: "Enter", keyCode: 229 }, open)).toEqual({ kind: "none" });
  });
  it("index wraps", () => {
    expect(nextMentionActiveIndex(0, 1, 3)).toBe(1);
    expect(nextMentionActiveIndex(2, 1, 3)).toBe(0);
    expect(nextMentionActiveIndex(0, -1, 3)).toBe(2);
    expect(nextMentionActiveIndex(9, 1, 3)).toBe(0);
    expect(nextMentionActiveIndex(0, 1, 0)).toBe(0);
  });
});

describe("mobile input environment", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it("false without window (SSR)", () => {
    expect(isMessengerComposerMobileInputEnvironment()).toBe(false);
  });
  it("coarse pointer → mobile; fine pointer → desktop", () => {
    const mk = (coarse: boolean) => ({
      matchMedia: (q: string) => ({ matches: q === "(pointer: coarse)" ? coarse : false }),
      location: { search: "", href: "https://x.test/" },
      sessionStorage: { getItem: () => null },
      localStorage: { getItem: () => null },
    });
    vi.stubGlobal("window", mk(true));
    vi.stubGlobal("document", { cookie: "" });
    expect(isMessengerComposerMobileInputEnvironment()).toBe(true);
    vi.stubGlobal("window", mk(false));
    expect(isMessengerComposerMobileInputEnvironment()).toBe(false);
  });
  it("Capacitor shell → mobile even with fine pointer", () => {
    vi.stubGlobal("window", {
      Capacitor: { getPlatform: () => "android" },
      matchMedia: () => ({ matches: false }),
    });
    expect(isMessengerComposerMobileInputEnvironment()).toBe(true);
  });
});
