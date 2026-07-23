import { describe, expect, it } from "vitest";
import {
  acceptGeneralDirectBootstrap,
  assertGeneralDirectOwnedRoom,
  assertGeneralDirectPreviewDoesNotUseMetadata,
  assertGeneralDirectReadAllowed,
  assertGeneralDirectViewerPermission,
  assertNotForeignDomainIdentity,
  buildGeneralDirectBadgeContribution,
  buildGeneralDirectCacheKey,
  buildGeneralDirectHeaderModel,
  buildGeneralDirectIdentity,
  buildGeneralDirectListSnapshot,
  buildGeneralDirectMarkReadPayload,
  buildGeneralDirectRowModel,
  countGeneralDirectUnreadRooms,
  GENERAL_DIRECT_DOMAIN,
  GENERAL_DIRECT_PEER_PLACEHOLDER_NAME,
  GENERAL_DIRECT_SOUND_EVENT_KEY,
  GeneralDirectReadonlyMemoryCache,
  generalDirectPorts,
  mergeGeneralDirectPartialBootstrap,
  parseGeneralDirectIdentityKey,
  resolveGeneralDirectDisplayIdentity,
  resolveGeneralDirectHeaderKind,
  resolveGeneralDirectNotificationDisplay,
  resolveGeneralDirectPreview,
  resolveGeneralDirectSoundKey,
  sumGeneralDirectUnread,
  type GeneralDirectRoomInput,
} from "@/lib/messenger/general-direct";
import { PHASE1_DEFAULT_CUTOVER } from "@/lib/messenger/contracts/cutover";

function gdRoom(partial: Partial<GeneralDirectRoomInput> & Pick<GeneralDirectRoomInput, "roomId">): GeneralDirectRoomInput {
  const peer = partial.peerUserId ?? "user-b";
  const identity =
    partial.domainIdentityKey ?? buildGeneralDirectIdentity("user-a", peer).identityKey;
  return {
    roomId: partial.roomId,
    chatDomain: partial.chatDomain ?? GENERAL_DIRECT_DOMAIN,
    domainIdentityKey: identity,
    peerUserId: peer,
    peerDisplayName: partial.peerDisplayName ?? "피어",
    peerAvatarUrl: partial.peerAvatarUrl ?? "https://cdn/a.png",
    lastMessage: partial.lastMessage ?? "안녕",
    lastMessageAt: partial.lastMessageAt ?? "2026-07-14T00:00:00.000Z",
    unreadCount: partial.unreadCount ?? 0,
    updatedAt: partial.updatedAt,
    roomType: partial.roomType,
  };
}

describe("Phase 2 general_direct Identity", () => {
  it("A/B and B/A share identity", () => {
    expect(buildGeneralDirectIdentity("user-b", "user-a")).toEqual(
      buildGeneralDirectIdentity("user-a", "user-b")
    );
    expect(parseGeneralDirectIdentityKey("general_direct:user-a:user-b")).toEqual({
      userA: "user-a",
      userB: "user-b",
    });
  });

  it("rejects self pair and wrong prefix / foreign domains", () => {
    expect(() => buildGeneralDirectIdentity("u1", "u1")).toThrow(/distinct_users/);
    expect(() => assertNotForeignDomainIdentity("trade:i:s:b")).toThrow(/foreign_identity/);
    expect(() => assertNotForeignDomainIdentity("store_order:o1")).toThrow(/foreign_identity/);
    expect(() => assertNotForeignDomainIdentity("group:r1")).toThrow(/foreign_identity/);
    expect(() =>
      assertGeneralDirectOwnedRoom({
        roomId: "r",
        chatDomain: "trade",
        domainIdentityKey: "trade:i:s:b",
      })
    ).toThrow(/domain_required/);
  });
});

describe("Phase 2 general_direct List", () => {
  it("returns only general_direct and one row per pair", () => {
    const result = buildGeneralDirectListSnapshot({
      viewerUserId: "user-a",
      generation: "g1",
      rooms: [gdRoom({ roomId: "r1" }), gdRoom({ roomId: "r2", peerUserId: "user-c", peerDisplayName: "씨" })],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.rows).toHaveLength(2);
    expect(result.snapshot.rows.every((r) => r.chatDomain === GENERAL_DIRECT_DOMAIN)).toBe(true);
  });

  it("fail-closed on trade/store_order/group and missing identity", () => {
    expect(
      buildGeneralDirectListSnapshot({
        viewerUserId: "user-a",
        generation: "g1",
        rooms: [gdRoom({ roomId: "r1", chatDomain: "trade", domainIdentityKey: "trade:i:s:b" })],
      }).ok
    ).toBe(false);
    expect(
      buildGeneralDirectListSnapshot({
        viewerUserId: "user-a",
        generation: "g1",
        rooms: [gdRoom({ roomId: "r1", chatDomain: "store_order", domainIdentityKey: "store_order:o" })],
      }).ok
    ).toBe(false);
    expect(
      buildGeneralDirectListSnapshot({
        viewerUserId: "user-a",
        generation: "g1",
        rooms: [gdRoom({ roomId: "r1", chatDomain: "group", domainIdentityKey: "group:g" })],
      }).ok
    ).toBe(false);
    expect(
      buildGeneralDirectListSnapshot({
        viewerUserId: "user-a",
        generation: "g1",
        rooms: [gdRoom({ roomId: "r1", domainIdentityKey: "" })],
      }).ok
    ).toBe(false);
  });

  it("does not merge duplicate identity rooms", () => {
    const result = buildGeneralDirectListSnapshot({
      viewerUserId: "user-a",
      generation: "g1",
      rooms: [
        gdRoom({ roomId: "r1" }),
        gdRoom({ roomId: "r2", domainIdentityKey: buildGeneralDirectIdentity("user-a", "user-b").identityKey }),
      ],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/duplicate_identity/);
  });

  it("does not create message-unit rows (one room → one list item)", () => {
    const result = buildGeneralDirectListSnapshot({
      viewerUserId: "user-a",
      generation: "g1",
      rooms: [gdRoom({ roomId: "r1", lastMessage: "m1" })],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.rows).toHaveLength(1);
  });
});

describe("Phase 2 general_direct Presentation / Header / Preview", () => {
  it("uses peer profile only and placeholder when missing", () => {
    const id = resolveGeneralDirectDisplayIdentity({
      roomId: "r1",
      chatDomain: GENERAL_DIRECT_DOMAIN,
      domainIdentityKey: buildGeneralDirectIdentity("user-a", "user-b").identityKey,
      peerDisplayName: "Shawn",
      peerAvatarUrl: "https://cdn/p.png",
    });
    expect(id).toEqual({ title: "Shawn", avatarUrl: "https://cdn/p.png", usedPeerUserFallback: false });
    expect(
      resolveGeneralDirectDisplayIdentity({
        roomId: "r1",
        chatDomain: GENERAL_DIRECT_DOMAIN,
        domainIdentityKey: buildGeneralDirectIdentity("user-a", "user-b").identityKey,
        peerDisplayName: null,
        peerAvatarUrl: null,
      }).title
    ).toBe(GENERAL_DIRECT_PEER_PLACEHOLDER_NAME);
    expect(() =>
      resolveGeneralDirectDisplayIdentity({
        roomId: "r1",
        chatDomain: GENERAL_DIRECT_DOMAIN,
        domainIdentityKey: buildGeneralDirectIdentity("user-a", "user-b").identityKey,
        peerDisplayName: "x",
        peerAvatarUrl: null,
        storeName: "매장",
      })
    ).toThrow(/foreign_presentation/);
  });

  it("header accepts only general_direct", () => {
    expect(
      resolveGeneralDirectHeaderKind({
        roomId: "r1",
        chatDomain: GENERAL_DIRECT_DOMAIN,
        domainIdentityKey: buildGeneralDirectIdentity("a", "b").identityKey,
      })
    ).toBe("general_peer");
    expect(() =>
      resolveGeneralDirectHeaderKind({
        roomId: "r1",
        chatDomain: "trade",
        domainIdentityKey: "trade:i:s:b",
      })
    ).toThrow(/header_rejects/);
    expect(() =>
      resolveGeneralDirectHeaderKind({
        roomId: "r1",
        chatDomain: "store_order",
        domainIdentityKey: "store_order:o",
      })
    ).toThrow(/header_rejects/);
    expect(() =>
      resolveGeneralDirectHeaderKind({
        roomId: "r1",
        chatDomain: "group",
        domainIdentityKey: "group:g",
      })
    ).toThrow(/header_rejects/);
  });

  it("preview uses latest message and rejects order/product summary", () => {
    expect(resolveGeneralDirectPreview({ content: "안녕", messageType: "text" })).toEqual({
      text: "안녕",
      source: "latest_user_message",
    });
    expect(() =>
      resolveGeneralDirectPreview({ content: "📋 주문 요약\n...", messageType: "text" })
    ).toThrow(/summary_forbidden/);
    expect(() =>
      assertGeneralDirectPreviewDoesNotUseMetadata({ orderSummary: "SO-1", headline: "x" })
    ).toThrow(/metadata_forbidden/);
  });

  it("row model wires title/avatar/preview/href", () => {
    const listed = buildGeneralDirectListSnapshot({
      viewerUserId: "user-a",
      generation: "1",
      rooms: [gdRoom({ roomId: "room-1", unreadCount: 2 })],
    });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    const row = buildGeneralDirectRowModel(listed.snapshot.rows[0]!);
    expect(row.title).toBe("피어");
    expect(row.avatarUrl).toBe("https://cdn/a.png");
    expect(row.previewText).toBe("안녕");
    expect(row.unreadCount).toBe(2);
    expect(row.href).toContain("/community-messenger/rooms/room-1");
    expect(buildGeneralDirectHeaderModel(listed.snapshot.rows[0]!).surface).toBe("general_direct_1to1");
  });
});

describe("Phase 2 general_direct Cache / Bootstrap / Read / Badge", () => {
  it("cache only allows chat.general namespace and forbids write", () => {
    const key = buildGeneralDirectCacheKey({ viewerUserId: "u1", generation: "9" });
    expect(key.startsWith("chat.general.")).toBe(true);
    expect(() => buildGeneralDirectCacheKey({ viewerUserId: "", generation: "1" })).toThrow();
    const cache = new GeneralDirectReadonlyMemoryCache();
    cache.seedForTest(key, []);
    expect(cache.read(key)).toEqual([]);
    expect(() => cache.writeForbidden()).toThrow(/write_forbidden_until_phase6/);
    expect(() => cache.read("chat.trade.snapshot.v1:x")).toThrow(/namespace_forbidden/);
  });

  it("bootstrap rejects foreign domains; partial does not wipe previous", () => {
    const full = acceptGeneralDirectBootstrap({
      viewerUserId: "user-a",
      generation: "1",
      mode: "full",
      rooms: [gdRoom({ roomId: "r1" })],
    });
    expect(full.ok).toBe(true);
    if (!full.ok) return;
    const rejected = acceptGeneralDirectBootstrap({
      viewerUserId: "user-a",
      generation: "2",
      mode: "full",
      rooms: [gdRoom({ roomId: "r1", chatDomain: "group", domainIdentityKey: "group:g" })],
    });
    expect(rejected.ok).toBe(false);
    const merged = mergeGeneralDirectPartialBootstrap(full.snapshot, {
      generation: "3",
      rooms: [gdRoom({ roomId: "r2", peerUserId: "user-c", peerDisplayName: "씨" })],
    });
    expect(merged.ok).toBe(true);
    if (!merged.ok) return;
    expect(merged.snapshot.rows.map((r) => r.roomId).sort()).toEqual(["r1", "r2"]);
    expect(merged.snapshot.generation).toBe("3");
  });

  it("read/unread/badge stay general_direct-only", () => {
    expect(() =>
      assertGeneralDirectReadAllowed({
        roomId: "r",
        chatDomain: "trade",
        domainIdentityKey: "trade:i:s:b",
      })
    ).toThrow(/read_rejects/);
    const payload = buildGeneralDirectMarkReadPayload({
      roomId: "r1",
      chatDomain: GENERAL_DIRECT_DOMAIN,
      domainIdentityKey: buildGeneralDirectIdentity("a", "b").identityKey,
    });
    expect(payload.clearBadgeTargets).toEqual(["chat_room"]);
    const listed = buildGeneralDirectListSnapshot({
      viewerUserId: "a",
      generation: "1",
      rooms: [
        gdRoom({ roomId: "r1", unreadCount: 2 }),
        gdRoom({ roomId: "r2", peerUserId: "c", unreadCount: 0 }),
      ],
    });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(sumGeneralDirectUnread(listed.snapshot.rows)).toBe(2);
    expect(countGeneralDirectUnreadRooms(listed.snapshot.rows)).toBe(1);
    const badge = buildGeneralDirectBadgeContribution(listed.snapshot.rows);
    expect(badge.domain).toBe(GENERAL_DIRECT_DOMAIN);
    expect(badge.unreadRoomCount).toBe(1);
    expect(badge.contributesTo).not.toContain("nav_trade");
  });

  it("permission requires participant", () => {
    expect(() =>
      assertGeneralDirectViewerPermission({
        viewerUserId: "user-a",
        room: {
          roomId: "r1",
          chatDomain: GENERAL_DIRECT_DOMAIN,
          domainIdentityKey: buildGeneralDirectIdentity("user-a", "user-b").identityKey,
          participantUserIds: ["user-b"],
        },
      })
    ).toThrow(/not_participant/);
  });
});

describe("Phase 2 general_direct Notification / Sound / cutover", () => {
  it("notification requires stored domain and forbids reinference inputs", () => {
    const d = resolveGeneralDirectNotificationDisplay({
      chatDomain: GENERAL_DIRECT_DOMAIN,
      domainIdentityKey: buildGeneralDirectIdentity("a", "b").identityKey,
      roomId: "r1",
      eventId: "e1",
      senderDisplayName: "Shawn",
      senderAvatarUrl: "https://cdn/s.png",
      messagePreview: "hi",
    });
    expect(d.title).toBe("Shawn");
    expect(() =>
      resolveGeneralDirectNotificationDisplay({
        chatDomain: GENERAL_DIRECT_DOMAIN,
        domainIdentityKey: buildGeneralDirectIdentity("a", "b").identityKey,
        roomId: "r1",
        eventId: "e1",
        senderDisplayName: "Shawn",
        senderAvatarUrl: null,
        messagePreview: "hi",
        directKey: "a:b",
      })
    ).toThrow(/reinference_forbidden/);
    expect(resolveGeneralDirectSoundKey()).toEqual({
      domain: GENERAL_DIRECT_DOMAIN,
      eventKey: GENERAL_DIRECT_SOUND_EVENT_KEY,
    });
  });

  it("keeps cutover off and ports domain locked", () => {
    expect(PHASE1_DEFAULT_CUTOVER.find((c) => c.domain === GENERAL_DIRECT_DOMAIN)?.mode).toBe("off");
    expect(generalDirectPorts.domain).toBe(GENERAL_DIRECT_DOMAIN);
    expect(generalDirectPorts.cache.readOnlyUntilCutover).toBe(true);
  });
});
