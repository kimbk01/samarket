import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getCmRoomRouteChunkWarmSession,
  noteCmRoomRouteChunkWarmRouteEntryShellPainted,
  resetCmRoomRouteChunkWarmForTests,
  warmCommunityMessengerRoomRouteChunks,
} from "@/lib/community-messenger/room/cm-room-route-chunk-warm";

function mockSessionStorage(): void {
  const store = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
  });
}

describe("cm-room-route-chunk-warm", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {});
    mockSessionStorage();
    resetCmRoomRouteChunkWarmForTests();
    let t = 1000;
    vi.stubGlobal("performance", { now: () => (t += 5) });
  });

  afterEach(() => {
    resetCmRoomRouteChunkWarmForTests();
    vi.unstubAllGlobals();
  });

  it("records source and layout-only warm without full chunks", async () => {
    vi.doMock("@/components/community-messenger/room/CommunityMessengerRoomLayoutShellClientBridge", () => ({
      CommunityMessengerRoomLayoutShellClientBridge: () => null,
    }));
    warmCommunityMessengerRoomRouteChunks("cm_layout_idle", { layoutOnly: true });
    const session = getCmRoomRouteChunkWarmSession();
    expect(session.sources).toContain("cm_layout_idle");
    expect(session.layout_chunk_start_ms).not.toBeNull();
    expect(session.page_entry_chunk_start_ms).toBeNull();
    expect(session.room_client_chunk_start_ms).toBeNull();
  });

  it("merges sources and records route entry shell paint once", () => {
    warmCommunityMessengerRoomRouteChunks("cm_hub_visible");
    warmCommunityMessengerRoomRouteChunks("list_io");
    const session = getCmRoomRouteChunkWarmSession();
    expect(session.sources).toEqual(expect.arrayContaining(["cm_hub_visible", "list_io"]));
    noteCmRoomRouteChunkWarmRouteEntryShellPainted(5000);
    noteCmRoomRouteChunkWarmRouteEntryShellPainted(6000);
    expect(getCmRoomRouteChunkWarmSession().route_entry_shell_paint_ms).toBe(5000);
  });
});
