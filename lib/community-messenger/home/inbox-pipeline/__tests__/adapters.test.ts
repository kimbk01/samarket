import { describe, expect, it } from "vitest";
import { summaryToCriticalRow as snapshotSummaryToCriticalRow } from "@/lib/community-messenger/full-bootstrap-snapshot-assemble";
import { summaryToCriticalRow as stageSummaryToCriticalRow } from "@/lib/community-messenger/bootstrap/critical-stage";
import {
  adaptCriticalRoomToCanonicalPatch,
  adaptRoomSummaryToCanonicalPatch,
} from "@/lib/community-messenger/home/inbox-pipeline/adapters";
import type {
  CommunityMessengerCriticalParticipantLabel,
  CommunityMessengerCriticalRoomRow,
  CommunityMessengerRoomSummary,
} from "@/lib/community-messenger/types";

function summary(overrides: Partial<CommunityMessengerRoomSummary> = {}): CommunityMessengerRoomSummary {
  return {
    id: "room-1",
    roomType: "direct",
    roomStatus: "active",
    visibility: "private",
    joinPolicy: "invite_only",
    identityPolicy: "real_name",
    isReadonly: false,
    title: "room",
    subtitle: "",
    summary: "",
    avatarUrl: null,
    unreadCount: 0,
    lastMessage: "hello",
    lastMessageAt: "2026-07-13T00:00:00.000Z",
    memberCount: 2,
    ownerUserId: null,
    ownerLabel: "",
    memberLimit: null,
    isDiscoverable: false,
    requiresPassword: false,
    allowMemberInvite: true,
    messengerDirectKey: null,
    contextMeta: null,
    ...overrides,
  };
}

function criticalRow(overrides: Partial<CommunityMessengerCriticalRoomRow> = {}): CommunityMessengerCriticalRoomRow {
  return {
    room_id: "room-1",
    room_type: "direct",
    direct_key: null,
    title: "room",
    avatar_url: null,
    avatar_ref: null,
    last_message_preview: "hello",
    last_message_at: "2026-07-13T00:00:00.000Z",
    unread_count: 0,
    participant_labels_minimal: [],
    group_meta: null,
    ...overrides,
  };
}

const labels: CommunityMessengerCriticalParticipantLabel[] = [
  { user_id: "u1", label: "A", avatar_url: null },
];

describe("inbox pipeline adapters", () => {
  it("preserves critical context_meta as contextMeta", () => {
    const patch = adaptCriticalRoomToCanonicalPatch(
      criticalRow({ context_meta: { v: 1, kind: "trade", productChatId: "pc-1" } })
    );
    expect(patch.contextMeta?.kind).toBe("trade");
    expect(patch.contextMeta?.productChatId).toBe("pc-1");
  });

  it("preserves full summary contextMeta", () => {
    const patch = adaptRoomSummaryToCanonicalPatch(
      summary({ contextMeta: { v: 1, kind: "delivery", storeOrderId: "order-1" } })
    );
    expect(patch.contextMeta).toEqual({ v: 1, kind: "delivery", storeOrderId: "order-1" });
  });

  it("keeps lite contextMeta omission distinct from explicit null", () => {
    const lite = summary();
    delete lite.contextMeta;
    const patch = adaptRoomSummaryToCanonicalPatch(lite);
    expect("contextMeta" in patch).toBe(false);
  });

  it("preserves core fields through a cache-style JSON round trip", () => {
    const patch = adaptRoomSummaryToCanonicalPatch(
      summary({
        id: "cache-room",
        messengerDirectKey: "trade_pc:pc-1",
        contextMeta: { v: 1, kind: "trade", productChatId: "pc-1", buyerId: "buyer" },
        unreadCount: 3,
      })
    );
    expect(JSON.parse(JSON.stringify(patch))).toMatchObject({
      roomId: "cache-room",
      directKey: "trade_pc:pc-1",
      contextMeta: { kind: "trade", productChatId: "pc-1", buyerId: "buyer" },
      unreadCount: 3,
    });
  });

  it("keeps critical/full identity fields aligned", () => {
    const full = summary({
      id: "same-room",
      roomType: "private_group",
      messengerDirectKey: null,
      memberCount: 4,
    });
    const critical = criticalRow({
      room_id: "same-room",
      room_type: "private_group",
      group_meta: { member_count: 4, member_limit: null, is_discoverable: false, join_policy: "invite_only" },
    });
    expect(adaptRoomSummaryToCanonicalPatch(full)).toMatchObject({
      roomId: "same-room",
      roomType: "private_group",
      memberCount: 4,
    });
    expect(adaptCriticalRoomToCanonicalPatch(critical)).toMatchObject({
      roomId: "same-room",
      roomType: "private_group",
      memberCount: 4,
    });
  });

  it("emits the same critical context_meta shape from both server mappers", () => {
    const room = summary({ contextMeta: { v: 1, kind: "trade", productChatId: "pc-1" } });
    expect(snapshotSummaryToCriticalRow(room, labels)).toMatchObject({
      context_meta: { v: 1, kind: "trade", productChatId: "pc-1" },
    });
    expect(stageSummaryToCriticalRow(room, labels)).toEqual(snapshotSummaryToCriticalRow(room, labels));
  });
});
