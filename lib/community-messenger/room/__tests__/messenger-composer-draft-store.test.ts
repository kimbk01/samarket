/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetMessengerComposerDraftMemoryForTests,
  clearMessengerComposerDraft,
  messengerComposerDraftKey,
  readMessengerComposerDraft,
  writeMessengerComposerDraft,
} from "@/lib/community-messenger/room/messenger-composer-draft-store";

describe("K-5 per-room composer draft store", () => {
  beforeEach(() => {
    __resetMessengerComposerDraftMemoryForTests();
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("key = viewer:room, null when either missing", () => {
    expect(messengerComposerDraftKey("u1", "r1")).toBe("u1:r1");
    expect(messengerComposerDraftKey("", "r1")).toBeNull();
    expect(messengerComposerDraftKey("u1", " ")).toBeNull();
  });

  it("round-trips per room and per viewer", () => {
    writeMessengerComposerDraft("u1:r1", "hello");
    writeMessengerComposerDraft("u1:r2", "other");
    expect(readMessengerComposerDraft("u1:r1")).toBe("hello");
    expect(readMessengerComposerDraft("u1:r2")).toBe("other");
    expect(readMessengerComposerDraft("u2:r1")).toBe("");
  });

  it("survives module memory reset via sessionStorage", () => {
    writeMessengerComposerDraft("u1:r1", "keep me");
    __resetMessengerComposerDraftMemoryForTests();
    expect(readMessengerComposerDraft("u1:r1")).toBe("keep me");
  });

  it("empty write and clear remove the draft", () => {
    writeMessengerComposerDraft("u1:r1", "x");
    writeMessengerComposerDraft("u1:r1", "   ");
    expect(readMessengerComposerDraft("u1:r1")).toBe("");
    writeMessengerComposerDraft("u1:r1", "y");
    clearMessengerComposerDraft("u1:r1");
    __resetMessengerComposerDraftMemoryForTests();
    expect(readMessengerComposerDraft("u1:r1")).toBe("");
  });

  it("storage failures are swallowed; memory still works", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => writeMessengerComposerDraft("u1:r1", "mem")).not.toThrow();
    expect(readMessengerComposerDraft("u1:r1")).toBe("mem");
    __resetMessengerComposerDraftMemoryForTests();
    expect(readMessengerComposerDraft("u1:r1")).toBe("");
  });
});
