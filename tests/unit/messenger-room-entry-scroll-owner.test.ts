import { beforeEach, describe, expect, it } from "vitest";
import {
  __getMessengerRoomEntryScrollStateForTest,
  canRunMessengerRoomScrollOwner,
  isMessengerRoomReadyForVirtualLayout,
  markMessengerRoomEntryScrollSettled,
  markMessengerRoomScrollOwnerRun,
  resetMessengerRoomEntryScrollOwner,
  setMessengerRoomEntryHydrationPass,
} from "@/lib/community-messenger/room/messenger-room-entry-scroll-owner";

const ROOM = "room-test-001";

describe("messenger-room-entry-scroll-owner", () => {
  beforeEach(() => {
    resetMessengerRoomEntryScrollOwner(ROOM);
  });

  it("allows only one entry scroll owner at a time", () => {
    expect(canRunMessengerRoomScrollOwner(ROOM, "room_entry_initial")).toBe(true);
    markMessengerRoomScrollOwnerRun(ROOM, "room_entry_initial");
    expect(canRunMessengerRoomScrollOwner(ROOM, "schedule_after_rows_painted")).toBe(false);
    markMessengerRoomEntryScrollSettled(ROOM, "room_entry_initial");
    expect(canRunMessengerRoomScrollOwner(ROOM, "schedule_after_rows_painted")).toBe(true);
  });

  it("blocks viewport resize scroll until entry settled", () => {
    expect(canRunMessengerRoomScrollOwner(ROOM, "viewport_resize_restore")).toBe(false);
    markMessengerRoomEntryScrollSettled(ROOM, "room_entry_initial");
    expect(canRunMessengerRoomScrollOwner(ROOM, "viewport_resize_restore")).toBe(true);
  });

  it("always allows own_message_append", () => {
    markMessengerRoomScrollOwnerRun(ROOM, "room_entry_initial");
    expect(canRunMessengerRoomScrollOwner(ROOM, "own_message_append")).toBe(true);
  });

  it("requires pass3 and settled scroll before virtual layout", () => {
    setMessengerRoomEntryHydrationPass(ROOM, 2);
    expect(isMessengerRoomReadyForVirtualLayout(ROOM)).toBe(false);
    setMessengerRoomEntryHydrationPass(ROOM, 3);
    expect(isMessengerRoomReadyForVirtualLayout(ROOM)).toBe(false);
    markMessengerRoomEntryScrollSettled(ROOM, "room_entry_initial");
    expect(isMessengerRoomReadyForVirtualLayout(ROOM)).toBe(true);
  });

  it("resets state per room", () => {
    setMessengerRoomEntryHydrationPass(ROOM, 3);
    markMessengerRoomEntryScrollSettled(ROOM, "room_entry_initial");
    resetMessengerRoomEntryScrollOwner(ROOM);
    expect(__getMessengerRoomEntryScrollStateForTest(ROOM)).toBeUndefined();
  });

  it("blocks duplicate entry scroll owner while active", () => {
    markMessengerRoomScrollOwnerRun(ROOM, "room_entry_initial");
    expect(canRunMessengerRoomScrollOwner(ROOM, "schedule_after_rows_painted")).toBe(false);
    expect(canRunMessengerRoomScrollOwner(ROOM, "viewport_resize_restore")).toBe(false);
  });

  it("re-entry restored pass3 marks entry scroll settled for virtual parity", () => {
    setMessengerRoomEntryHydrationPass(ROOM, 3);
    markMessengerRoomEntryScrollSettled(ROOM, "reentry_hydration_restored");
    expect(isMessengerRoomReadyForVirtualLayout(ROOM)).toBe(true);
  });
});
