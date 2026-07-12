import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function stubViewport(wide: boolean) {
  vi.stubGlobal("window", {
    setTimeout: (cb: () => void) => {
      cb();
      return 1;
    },
    location: { pathname: "/community-messenger/rooms/room-mobile-test" },
    matchMedia: (query: string) => ({
      matches: wide,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  });
  vi.stubGlobal(
    "matchMedia",
    (query: string) => ({
      matches: wide,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
  );
}

describe("beginCmRoomEntryPriorityMode split viewport", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not freeze list when messenger split viewport matches", async () => {
    stubViewport(true);

    const priority = await import("@/lib/community-messenger/room/cm-room-entry-priority-mode");
    const pause = await import("@/lib/community-messenger/room/cm-room-list-render-pause");

    priority.beginCmRoomEntryPriorityMode("room-split-test");
    expect(pause.shouldFreezeRoomListSubtree()).toBe(false);
    expect(priority.isCmRoomEntryPriorityModeActive()).toBe(false);
  });

  it("freezes list on mobile viewport during room entry priority", async () => {
    stubViewport(false);

    const priority = await import("@/lib/community-messenger/room/cm-room-entry-priority-mode");
    const pause = await import("@/lib/community-messenger/room/cm-room-list-render-pause");

    priority.beginCmRoomEntryPriorityMode("room-mobile-test");
    expect(pause.shouldFreezeRoomListSubtree()).toBe(true);
    priority.endCmRoomEntryPriorityMode("room_unmount");
    expect(pause.shouldFreezeRoomListSubtree()).toBe(false);
  });
});
