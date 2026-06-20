import { describe, expect, it } from "vitest";
import { resolveMessengerRoomEntryScrollFinalize } from "@/lib/community-messenger/room/messenger-room-entry-scroll-settle";

describe("messenger-room-entry-scroll-settle", () => {
  it("initial_load defers entryScrollSettled until composer synced", () => {
    expect(
      resolveMessengerRoomEntryScrollFinalize({
        reason: "initial_load",
        stickToBottom: true,
        composerHeightSynced: false,
      })
    ).toEqual({
      markInitialScrollDone: true,
      markEntrySettled: false,
      pendingTailSettle: true,
      completeTailSettle: false,
    });
  });

  it("initial_load single-phase when composer already synced", () => {
    expect(
      resolveMessengerRoomEntryScrollFinalize({
        reason: "initial_load",
        stickToBottom: true,
        composerHeightSynced: true,
      })
    ).toEqual({
      markInitialScrollDone: true,
      markEntrySettled: true,
      pendingTailSettle: false,
      completeTailSettle: true,
    });
  });

  it("entry_tail_settle is terminal settled", () => {
    expect(
      resolveMessengerRoomEntryScrollFinalize({
        reason: "entry_tail_settle",
        stickToBottom: true,
        composerHeightSynced: true,
      })
    ).toEqual({
      markInitialScrollDone: false,
      markEntrySettled: true,
      pendingTailSettle: false,
      completeTailSettle: true,
    });
  });

  it("room_entry_restore mid-history does not schedule tail settle", () => {
    expect(
      resolveMessengerRoomEntryScrollFinalize({
        reason: "room_entry_restore",
        stickToBottom: false,
        composerHeightSynced: false,
      })
    ).toEqual({
      markInitialScrollDone: true,
      markEntrySettled: true,
      pendingTailSettle: false,
      completeTailSettle: true,
    });
  });

  it("push_entry_initial_load mirrors initial_load defer", () => {
    expect(
      resolveMessengerRoomEntryScrollFinalize({
        reason: "push_entry_initial_load",
        stickToBottom: true,
        composerHeightSynced: false,
      }).pendingTailSettle
    ).toBe(true);
  });
});
