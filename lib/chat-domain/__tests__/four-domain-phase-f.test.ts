import { describe, expect, it } from "vitest";
import {
  applyAtomicRoomRead,
  shouldAcceptIncomingRoomRead,
  type DomainRoomReadVersion,
} from "@/lib/chat-domain/room-read";
import { pickRichestAuthoritativeRoomSnapshot } from "@/lib/community-messenger/room/messenger-room-initial-snapshot-authority";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";

function ver(
  partial: Partial<DomainRoomReadVersion> & Pick<DomainRoomReadVersion, "versionMs" | "source">,
): DomainRoomReadVersion {
  return {
    roomId: "r1",
    ...partial,
  };
}

function snap(partial: {
  id?: string;
  lastMessageAt: string;
  messages?: Array<{ id: string; createdAt: string }>;
  readVersionSource?: CommunityMessengerRoomSnapshot["readVersionSource"];
}): CommunityMessengerRoomSnapshot {
  const messages = (partial.messages ?? []).map((m) => ({
    id: m.id,
    roomId: "r1",
    senderId: "u1",
    messageType: "text" as const,
    content: "x",
    createdAt: m.createdAt,
    metadata: null,
  }));
  return {
    viewerUserId: "viewer",
    room: {
      id: partial.id ?? "r1",
      roomType: "direct",
      roomStatus: "active",
      visibility: "private",
      joinPolicy: "invite_only",
      identityPolicy: "real_name",
      isReadonly: false,
      title: "t",
      subtitle: "",
      summary: "",
      avatarUrl: null,
      unreadCount: 0,
      lastMessage: messages.length ? "x" : "",
      lastMessageAt: partial.lastMessageAt,
      memberCount: 2,
      ownerUserId: "viewer",
      ownerLabel: "",
      memberLimit: null,
      isDiscoverable: false,
      requiresPassword: false,
      allowMemberInvite: false,
    },
    members: [],
    messages: messages as CommunityMessengerRoomSnapshot["messages"],
    myRole: "member",
    activeCall: null,
    readVersionSource: partial.readVersionSource,
  };
}

describe("Phase F atomic room read", () => {
  it("rejects stale incoming version", () => {
    const prev = ver({ versionMs: 2000, source: "server_bootstrap" });
    const incoming = ver({ versionMs: 1000, source: "memory_cache" });
    expect(shouldAcceptIncomingRoomRead(prev, incoming)).toBe(false);
    const applied = applyAtomicRoomRead({
      prevValue: "prev",
      prevVersion: prev,
      incomingValue: "stale",
      incomingVersion: incoming,
    });
    expect(applied).toMatchObject({ accepted: false, reason: "rejected_stale", value: "prev" });
  });

  it("accepts newer version; optimistic cannot beat equal server", () => {
    expect(
      shouldAcceptIncomingRoomRead(
        ver({ versionMs: 1000, source: "optimistic" }),
        ver({ versionMs: 2000, source: "server_bootstrap" }),
      ),
    ).toBe(true);
    expect(
      shouldAcceptIncomingRoomRead(
        ver({ versionMs: 2000, source: "server_bootstrap" }),
        ver({ versionMs: 2000, source: "optimistic" }),
      ),
    ).toBe(false);
  });

  it("pickRichest prefers fresher server over richer stale cache", () => {
    const server = snap({
      lastMessageAt: "2026-07-23T10:00:00.000Z",
      messages: [{ id: "m2", createdAt: "2026-07-23T10:00:00.000Z" }],
      readVersionSource: "server_bootstrap",
    });
    const staleRich = snap({
      lastMessageAt: "2026-07-23T09:00:00.000Z",
      messages: [
        { id: "m0", createdAt: "2026-07-23T08:00:00.000Z" },
        { id: "m1", createdAt: "2026-07-23T09:00:00.000Z" },
      ],
      readVersionSource: "memory_cache",
    });
    const picked = pickRichestAuthoritativeRoomSnapshot(server, staleRich);
    expect(picked?.messages.map((m) => m.id)).toEqual(["m2"]);
  });
});
