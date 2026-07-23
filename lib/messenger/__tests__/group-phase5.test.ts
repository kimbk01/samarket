import { describe, expect, it } from "vitest";
import {
  acceptGroupBootstrap,
  assertGroupOwnedRoom,
  assertGroupPreviewDoesNotUseMetadata,
  assertGroupReadAllowed,
  assertGroupViewerPermission,
  buildGroupBadgeContribution,
  buildGroupCacheKey,
  buildGroupHeaderModel,
  buildGroupIdentity,
  buildGroupListSnapshot,
  buildGroupMarkReadPayload,
  buildGroupRowModel,
  countGroupUnreadRooms,
  GROUP_DOMAIN,
  GROUP_SOUND_EVENT_KEY,
  GroupReadonlyMemoryCache,
  groupPorts,
  mergeGroupPartialBootstrap,
  parseGroupIdentityKey,
  resolveGroupNotificationDisplay,
  resolveGroupPresentation,
  resolveGroupPreview,
  resolveGroupSoundKey,
  type GroupRoomInput,
} from "@/lib/messenger/group";
import { composeMessengerTabBadge } from "@/lib/messenger/shell";
import { buildGeneralDirectBadgeContribution } from "@/lib/messenger/general-direct";

function groupRoom(
  partial: Partial<GroupRoomInput> & { roomId: string; groupId?: string }
): GroupRoomInput {
  const groupId = partial.groupId ?? partial.roomId;
  return {
    roomId: partial.roomId,
    chatDomain: partial.chatDomain ?? GROUP_DOMAIN,
    domainIdentityKey: partial.domainIdentityKey ?? `group:${groupId}`,
    groupId,
    groupSubtype: partial.groupSubtype ?? "private_group",
    groupName: partial.groupName ?? "우리 동네",
    groupImageUrl: partial.groupImageUrl ?? "https://cdn/g.png",
    memberCount: partial.memberCount ?? 5,
    lastMessage: partial.lastMessage ?? "안녕하세요",
    lastMessageAt: partial.lastMessageAt ?? "2026-07-14T12:00:00.000Z",
    unreadCount: partial.unreadCount ?? 0,
    updatedAt: partial.updatedAt,
    peerDisplayName: partial.peerDisplayName,
    peerAvatarUrl: partial.peerAvatarUrl,
  };
}

describe("Phase 5 group Identity / List", () => {
  it("builds group:{groupId}; same groupId → same identity regardless of members", () => {
    const a = buildGroupIdentity("g1");
    const b = buildGroupIdentity("g1");
    const c = buildGroupIdentity("g2");
    expect(a.identityKey).toBe("group:g1");
    expect(a.identityKey).toBe(b.identityKey);
    expect(c.identityKey).toBe("group:g2");
    expect(parseGroupIdentityKey(a.identityKey)).toEqual({ groupId: "g1" });
    expect(() => parseGroupIdentityKey("general_direct:a:b")).toThrow(/foreign_identity/);
    expect(() => parseGroupIdentityKey("trade:i:s:b")).toThrow(/foreign_identity/);
    expect(() => parseGroupIdentityKey("store_order:o")).toThrow(/foreign_identity/);
    expect(() =>
      assertGroupOwnedRoom({
        roomId: "r",
        chatDomain: "general_direct",
        domainIdentityKey: "general_direct:a:b",
      })
    ).toThrow(/domain_required/);
  });

  it("list returns group only; one row per group; duplicate identity fails", () => {
    const listed = buildGroupListSnapshot({
      viewerUserId: "u1",
      generation: "1",
      rooms: [groupRoom({ roomId: "g1" }), groupRoom({ roomId: "g2", groupName: "다른 그룹" })],
    });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.snapshot.rows).toHaveLength(2);
    expect(listed.snapshot.rows.every((r) => r.chatDomain === GROUP_DOMAIN)).toBe(true);
    expect(
      buildGroupListSnapshot({
        viewerUserId: "u1",
        generation: "1",
        rooms: [groupRoom({ roomId: "g1", chatDomain: "trade", domainIdentityKey: "trade:i:s:b" })],
      }).ok
    ).toBe(false);
    expect(
      buildGroupListSnapshot({
        viewerUserId: "u1",
        generation: "1",
        rooms: [
          groupRoom({ roomId: "g1" }),
          groupRoom({ roomId: "other", groupId: "g1", domainIdentityKey: "group:g1" }),
        ],
      }).ok
    ).toBe(false);
  });
});

describe("Phase 5 group Presentation / Header / Preview / Row", () => {
  it("uses group name/image; rejects member fallback", () => {
    const p = resolveGroupPresentation({
      roomId: "g1",
      chatDomain: GROUP_DOMAIN,
      domainIdentityKey: "group:g1",
      groupName: "우리 동네",
      groupImageUrl: "https://cdn/g.png",
      memberCount: 4,
      subtype: "private_group",
    });
    expect(p.title).toBe("우리 동네");
    expect(p.avatarUrl).toContain("g.png");
    expect(() =>
      resolveGroupPresentation({
        roomId: "g1",
        chatDomain: GROUP_DOMAIN,
        domainIdentityKey: "group:g1",
        groupName: "우리 동네",
        groupImageUrl: null,
        peerUserName: "회원",
      })
    ).toThrow(/member_avatar_or_name/);
  });

  it("header group only; preview keeps latest message", () => {
    const listed = buildGroupListSnapshot({
      viewerUserId: "u1",
      generation: "1",
      rooms: [groupRoom({ roomId: "g1", lastMessage: "오늘 모임" })],
    });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    const header = buildGroupHeaderModel(listed.snapshot.rows[0]!);
    expect(header.kind).toBe("group");
    expect(header.forbidsGeneralDirectHeader).toBe(true);
    expect(resolveGroupPreview({ message: { content: "오늘 모임", messageType: "text" } }).text).toBe(
      "오늘 모임"
    );
    expect(
      resolveGroupPreview({
        message: { content: "안녕", messageType: "text", senderDisplayName: "철수" },
      }).text
    ).toBe("철수: 안녕");
    expect(() =>
      assertGroupPreviewDoesNotUseMetadata({ groupDescription: "소개글" })
    ).toThrow(/metadata_forbidden/);
    const row = buildGroupRowModel(listed.snapshot.rows[0]!);
    expect(row.chatDomain).toBe(GROUP_DOMAIN);
    expect(row.title).toBe("우리 동네");
    expect(row.previewText).toBe("오늘 모임");
    expect(row.memberCount).toBe(5);
  });
});

describe("Phase 5 group Cache / Badge / Notif / Permission", () => {
  it("cache chat.group only; badge contributes nav_messenger", () => {
    const key = buildGroupCacheKey({ viewerUserId: "u1", generation: "1" });
    expect(key.startsWith("chat.group.")).toBe(true);
    const cache = new GroupReadonlyMemoryCache();
    expect(() => cache.writeForbidden()).toThrow(/write_forbidden/);
    expect(() => cache.read("chat.general.x")).toThrow(/namespace_forbidden/);

    const listed = buildGroupListSnapshot({
      viewerUserId: "u1",
      generation: "1",
      rooms: [groupRoom({ roomId: "g1", unreadCount: 2 })],
    });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    const badge = buildGroupBadgeContribution(listed.snapshot.rows);
    expect(badge.navMessengerContribution).toBe(1);
    expect(badge.navDeliveryContribution).toBe(0);
    expect(badge.navTradeContribution).toBe(0);
    expect(countGroupUnreadRooms(listed.snapshot.rows)).toBe(1);
    expect(
      composeMessengerTabBadge(
        { domain: "general_direct", count: 2 },
        { domain: "group", count: badge.navMessengerContribution }
      )
    ).toBe(3);
    expect(() =>
      buildGeneralDirectBadgeContribution([
        {
          roomId: "g1",
          chatDomain: "group" as never,
          domainIdentityKey: "group:g1",
          peerUserId: "a",
          peerDisplayName: "x",
          peerAvatarUrl: null,
          lastMessage: "",
          lastMessageAt: "",
          unreadCount: 1,
          updatedAt: "",
          generation: "1",
        },
      ])
    ).toThrow(/foreign_row/);
  });

  it("notification rejects reinference; permission requires membership", () => {
    expect(
      resolveGroupNotificationDisplay({
        chatDomain: GROUP_DOMAIN,
        domainIdentityKey: "group:g1",
        roomId: "g1",
        eventId: "e1",
        groupName: "우리 동네",
        groupImageUrl: null,
        senderName: "영희",
        messagePreview: "hi",
      }).groupName
    ).toBe("우리 동네");
    expect(() =>
      resolveGroupNotificationDisplay({
        chatDomain: GROUP_DOMAIN,
        domainIdentityKey: "group:g1",
        roomId: "g1",
        eventId: "e1",
        groupName: "우리 동네",
        groupImageUrl: null,
        senderName: "영희",
        messagePreview: "hi",
        roomType: "group",
      })
    ).toThrow(/reinference/);
    expect(resolveGroupSoundKey().eventKey).toBe(GROUP_SOUND_EVENT_KEY);
    expect(() =>
      assertGroupReadAllowed({
        roomId: "g1",
        chatDomain: "trade",
        domainIdentityKey: "trade:i:s:b",
      })
    ).toThrow(/read_rejects/);
    expect(
      buildGroupMarkReadPayload({
        roomId: "g1",
        chatDomain: GROUP_DOMAIN,
        domainIdentityKey: "group:g1",
      }).clearBadgeTargets
    ).toEqual(["group"]);
    expect(() =>
      assertGroupViewerPermission({
        viewerUserId: "stranger",
        room: {
          roomId: "g1",
          chatDomain: GROUP_DOMAIN,
          domainIdentityKey: "group:g1",
          groupId: "g1",
          subtype: "private_group",
          memberUserIds: ["u1", "u2"],
        },
      })
    ).toThrow(/membership_required/);
    expect(groupPorts.badge.contributesTo).toContain("nav_messenger");
  });

  it("bootstrap reject foreign; partial preserves prior", () => {
    const full = acceptGroupBootstrap({
      viewerUserId: "u1",
      generation: "1",
      mode: "full",
      rooms: [groupRoom({ roomId: "g1" })],
    });
    expect(full.ok).toBe(true);
    if (!full.ok) return;
    expect(
      acceptGroupBootstrap({
        viewerUserId: "u1",
        generation: "2",
        mode: "full",
        rooms: [groupRoom({ roomId: "g1", chatDomain: "general_direct", domainIdentityKey: "general_direct:a:b" })],
      }).ok
    ).toBe(false);
    const merged = mergeGroupPartialBootstrap(full.snapshot, {
      generation: "3",
      rooms: [groupRoom({ roomId: "g2" })],
    });
    expect(merged.ok).toBe(true);
    if (!merged.ok) return;
    expect(merged.snapshot.rows.map((r) => r.roomId).sort()).toEqual(["g1", "g2"]);
  });
});
