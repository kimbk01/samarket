/**
 * Phase 3 S2-4 — stale Hub list eviction after Group Delete.
 * Behavior tests: tombstone + remove_room + merge cannot re-insert.
 */
import { describe, expect, it, beforeEach } from "vitest";
import {
  clearDeletedGroupRoomTombstonesForTests,
  isRememberedDeletedGroupRoomId,
  rememberDeletedGroupRoomId,
  stripRememberedDeletedGroupRoomsFromBootstrap,
} from "@/lib/community-messenger/home/group-delete-list-tombstone";
import { applyHomeListPatch } from "@/lib/community-messenger/home-list-patch";
import type { CommunityMessengerBootstrap, CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function room(id: string, title: string): CommunityMessengerRoomSummary {
  return {
    id,
    roomType: "private_group",
    roomStatus: "active",
    title,
    lastMessage: "seed",
    lastMessageAt: "2026-07-31T00:00:00.000Z",
    lastMessageType: "text",
    unreadCount: 0,
    memberCount: 2,
    isArchivedByViewer: false,
  } as CommunityMessengerRoomSummary;
}

function bootstrap(groups: CommunityMessengerRoomSummary[]): CommunityMessengerBootstrap {
  return {
    me: { id: "u1" },
    chats: [],
    groups,
    requests: [],
    friends: [],
    following: [],
    hidden: [],
    blocked: [],
    discoverableGroups: [],
    calls: [],
    tabs: { chats: 0, groups: groups.length, friends: 0, calls: 0 },
  } as unknown as CommunityMessengerBootstrap;
}

describe("group delete stale list eviction contract", () => {
  beforeEach(() => {
    clearDeletedGroupRoomTombstonesForTests();
  });

  it("wires realtime deleted_at → noteGroupRoomDeletedFromRealtime before tip path", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/community-messenger/realtime/community-messenger-home-realtime-channels.ts"),
      "utf8"
    );
    expect(src).toContain("noteGroupRoomDeletedFromRealtime");
    expect(src).toContain("room_deleted_at_received");
    const handlerStart = src.indexOf('table: "community_messenger_rooms"');
    const slice = src.slice(handlerStart, handlerStart + 2500);
    const deletedIdx = slice.indexOf("noteGroupRoomDeletedFromRealtime");
    const tipIdx = slice.indexOf("normalizeHomeRoomTipUpdateLivePatch(oldRow, row)");
    expect(deletedIdx).toBeGreaterThan(0);
    expect(tipIdx).toBeGreaterThan(deletedIdx);
  });

  it("owner delete UI uses evictDeletedGroupRoomFromHomeLists not leave-only sync", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/community-messenger/room/phase2/use-messenger-room-phase2-controller.ts"),
      "utf8"
    );
    expect(src).toContain("evictDeletedGroupRoomFromHomeLists");
    const deleteFn = src.indexOf("const deletePrivateGroupRoom = useCallback");
    const leaveSyncInDelete = src.indexOf("syncMessengerHomeAfterRoomLeave(streamRoomId)", deleteFn);
    const evictInDelete = src.indexOf("evictDeletedGroupRoomFromHomeLists", deleteFn);
    expect(evictInDelete).toBeGreaterThan(deleteFn);
    // leave sync must not be the delete success path
    expect(leaveSyncInDelete === -1 || leaveSyncInDelete > src.indexOf("startGroupCall", deleteFn)).toBe(true);
  });

  it("bus carries cm.home.remove_room deleted reason", () => {
    const bus = readFileSync(join(process.cwd(), "lib/community-messenger/multi-tab-bus.ts"), "utf8");
    expect(bus).toContain('type: "cm.home.remove_room"');
    expect(bus).toContain('reason: "deleted"');
    const home = readFileSync(
      join(process.cwd(), "lib/community-messenger/home/use-community-messenger-home-realtime-bootstrap-list.ts"),
      "utf8"
    );
    expect(home).toContain('ev.type === "cm.home.remove_room"');
    expect(home).toContain('kind: "remove_room"');
  });

  it("remove_room drops deleted group from hub lists", () => {
    const base = bootstrap([room("g-keep", "Keep"), room("g-del", "Delete Me")]);
    const next = applyHomeListPatch(base, { kind: "remove_room", roomId: "g-del" }, "multi-tab");
    expect(next?.groups.map((g) => g.id)).toEqual(["g-keep"]);
  });

  it("bootstrap_apply_full cannot re-insert remembered deleted room", () => {
    rememberDeletedGroupRoomId("g-del");
    expect(isRememberedDeletedGroupRoomId("g-del")).toBe(true);
    const prev = bootstrap([room("g-keep", "Keep"), room("g-del", "Stale")]);
    const incoming = bootstrap([room("g-keep", "Keep")]);
    const merged = applyHomeListPatch(
      prev,
      { kind: "bootstrap_apply_full", next: incoming, mergeStaleOutgoingRequests: true },
      "bootstrap"
    );
    expect(merged?.groups.some((g) => g.id === "g-del")).toBe(false);
    expect(merged?.groups.some((g) => g.id === "g-keep")).toBe(true);
  });

  it("strip helper drops tombstoned rows only", () => {
    rememberDeletedGroupRoomId("g-del");
    const out = stripRememberedDeletedGroupRoomsFromBootstrap(
      bootstrap([room("g-keep", "Keep"), room("g-del", "Gone")])
    );
    expect(out.groups.map((g) => g.id)).toEqual(["g-keep"]);
  });

  it("delete service publishes listAction remove bump for peers", () => {
    const svc = readFileSync(
      join(process.cwd(), "lib/community-messenger/group/group-room-delete-service.ts"),
      "utf8"
    );
    expect(svc).toContain('listAction: "remove"');
    expect(svc).toContain('reason: "group_deleted"');
    const rt = readFileSync(join(process.cwd(), "lib/community-messenger/group/group-room-realtime.ts"), "utf8");
    expect(rt).toContain("listAction");
    const bumpSub = readFileSync(
      join(process.cwd(), "lib/community-messenger/room/use-messenger-room-bump-broadcast-subscription.ts"),
      "utf8"
    );
    expect(bumpSub).toContain('listAction === "remove"');
    expect(bumpSub).toContain("evictDeletedGroupRoomFromHomeLists");
  });
  it("does not import Ban/Ghost/Online LOCK services", () => {
    const eviction = readFileSync(
      join(process.cwd(), "lib/community-messenger/home/group-delete-home-list-eviction.ts"),
      "utf8"
    );
    expect(eviction).not.toContain("group-room-ban-service");
    expect(eviction).not.toContain("ghost");
    expect(eviction).not.toContain("online-count");
  });
});
