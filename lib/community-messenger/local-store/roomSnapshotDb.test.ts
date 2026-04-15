import { describe, expect, it, vi } from "vitest";

// Minimal smoke test: module loads in test env (no indexedDB)
// and all functions are resilient (return null/void without throwing).
describe("roomSnapshotDb (no indexedDB)", () => {
  it("getLocalRoomSnapshot returns null without throwing", async () => {
    const mod = await import("./roomSnapshotDb");
    await expect(mod.getLocalRoomSnapshot("room-1")).resolves.toBeNull();
  });

  it("putLocalRoomSnapshot does not throw without indexedDB", async () => {
    const mod = await import("./roomSnapshotDb");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fake = { viewerUserId: "u", room: { id: "r", title: "t" } } as any;
    await expect(mod.putLocalRoomSnapshot("room-1", fake)).resolves.toBeUndefined();
  });

  it("invalidateLocalRoomSnapshot does not throw without indexedDB", async () => {
    const mod = await import("./roomSnapshotDb");
    await expect(mod.invalidateLocalRoomSnapshot("room-1")).resolves.toBeUndefined();
  });
});

