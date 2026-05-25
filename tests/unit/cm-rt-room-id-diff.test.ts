import { describe, expect, it } from "vitest";
import {
  diffRoomIdFingerprints,
  roomFingerprintsEqual,
  roomIdsFromFingerprint,
} from "@/lib/community-messenger/realtime/cm-rt-room-id-diff";

describe("cm-rt-room-id-diff", () => {
  it("computes added and removed room ids", () => {
    const diff = diffRoomIdFingerprints("room-a\0room-b", "room-b\0room-c");
    expect(diff.prev).toEqual(["room-a", "room-b"]);
    expect(diff.next).toEqual(["room-b", "room-c"]);
    expect(diff.added).toEqual(["room-c"]);
    expect(diff.removed).toEqual(["room-a"]);
  });

  it("treats reorder as equal fingerprint", () => {
    expect(roomFingerprintsEqual("b\0a", "a\0b")).toBe(true);
    expect(roomIdsFromFingerprint("B\0a")).toEqual(["a", "b"]);
  });
});
