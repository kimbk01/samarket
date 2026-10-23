import { describe, expect, it } from "vitest";
import {
  beginComposerFailRestoreSession,
  createComposerFailRestoreSession,
  markComposerFailRestoreDirty,
  shouldRestoreComposerAfterSendFail,
} from "@/lib/community-messenger/room/messenger-composer-fail-restore";

describe("messenger-composer-fail-restore (M-8)", () => {
  it("restores only when user never edited after send began", () => {
    const session = createComposerFailRestoreSession();
    const gen = beginComposerFailRestoreSession(session);
    expect(
      shouldRestoreComposerAfterSendFail({
        session,
        sendGeneration: gen,
        restoreOnFail: "hello",
      })
    ).toBe(true);
  });

  it("does not restore after user typed (including type-then-clear)", () => {
    const session = createComposerFailRestoreSession();
    const gen = beginComposerFailRestoreSession(session);
    markComposerFailRestoreDirty(session);
    expect(
      shouldRestoreComposerAfterSendFail({
        session,
        sendGeneration: gen,
        restoreOnFail: "hello",
      })
    ).toBe(false);
  });

  it("does not restore when a newer send started", () => {
    const session = createComposerFailRestoreSession();
    const gen1 = beginComposerFailRestoreSession(session);
    beginComposerFailRestoreSession(session);
    expect(
      shouldRestoreComposerAfterSendFail({
        session,
        sendGeneration: gen1,
        restoreOnFail: "first",
      })
    ).toBe(false);
  });

  it("does not restore when restoreOnFail is omitted", () => {
    const session = createComposerFailRestoreSession();
    const gen = beginComposerFailRestoreSession(session);
    expect(
      shouldRestoreComposerAfterSendFail({
        session,
        sendGeneration: gen,
        restoreOnFail: undefined,
      })
    ).toBe(false);
  });
});
