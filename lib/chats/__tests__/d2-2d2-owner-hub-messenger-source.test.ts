import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const chatRooms = vi.fn();
const hubRefresh = vi.fn();
vi.mock("@/lib/chats/chat-rooms-snapshot-cache", () => ({
  invalidateChatRoomsSnapshotCache: (u: string) => chatRooms(u),
}));
vi.mock("@/lib/chats/hub-badge-snapshot-refresh", () => ({
  scheduleOwnerHubBadgeSnapshotRefresh: (u: string) => hubRefresh(u),
}));

import { invalidateOwnerHubBadgeCache } from "@/lib/chats/owner-hub-badge-cache";

describe("D2 2-d-2 — messenger changes do not rebuild the trade chat rooms snapshot", () => {
  beforeEach(() => {
    chatRooms.mockReset();
    hubRefresh.mockReset();
  });

  it("default (trade / order / mark-all-read callers) still rebuilds chat rooms + hub badge", () => {
    invalidateOwnerHubBadgeCache("u1");
    expect(chatRooms).toHaveBeenCalledWith("u1");
    expect(hubRefresh).toHaveBeenCalledWith("u1");
  });

  it("source messenger → hub badge only", () => {
    invalidateOwnerHubBadgeCache("u1", { source: "messenger" });
    expect(chatRooms).not.toHaveBeenCalled();
    expect(hubRefresh).toHaveBeenCalledWith("u1");
  });

  it("messenger send / mark-read callers pass the source; call-stub room bump and trade sync stay default", () => {
    const svc = readFileSync("lib/community-messenger/service.ts", "utf8");
    expect(svc.match(/invalidateOwnerHubBadgeCache\([^)]*\{ source: "messenger" \}\)/g)?.length).toBe(6);
    const post = readFileSync("lib/community-messenger/server/community-messenger-send-post-ack-effects.ts", "utf8");
    /** 2026-11-21 보내기 2단계 — 같은 출처 + 사본은 바뀜 표시(lazySnapshot) */
    expect(post).toContain('invalidateOwnerHubBadgeCache(id, { source: "messenger", lazySnapshot: true })');
    for (const f of [
      "lib/community-messenger/server/publish-messenger-room-bump.ts",
      "lib/community-messenger/server/publish-message-hard-deleted-room-bump.ts",
      "lib/trade/sync-item-trade-read-with-messenger-room.ts",
      "app/api/me/chats/mark-all-read/route.ts",
    ]) {
      expect(readFileSync(f, "utf8")).not.toContain('source: "messenger"');
    }
  });
});
