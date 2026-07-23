/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearMessengerRoomReadBlocksForTests,
  isMessengerRoomReadGateExtraBlocked,
  messengerRoomReadBlockKeyImageLightbox,
  setMessengerRoomReadBlock,
} from "@/lib/community-messenger/room/messenger-room-read-gate";

describe("isMessengerRoomReadGateExtraBlocked", () => {
  beforeEach(() => {
    clearMessengerRoomReadBlocksForTests();
  });

  it("does not block room B when only room A lightbox is open", () => {
    setMessengerRoomReadBlock(messengerRoomReadBlockKeyImageLightbox("room-a"), true);
    expect(isMessengerRoomReadGateExtraBlocked("room-a")).toBe(true);
    expect(isMessengerRoomReadGateExtraBlocked("room-b")).toBe(false);
  });
});
