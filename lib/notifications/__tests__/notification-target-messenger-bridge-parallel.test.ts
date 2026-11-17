import { beforeEach, describe, expect, it, vi } from "vitest";

/** P2 — 텍스트 전송 전용 병렬 target bump (B2 · B8 left_at) */
const bumpChatRoomTargetFromMessengerParticipant = vi.fn();
const bumpNotificationTarget = vi.fn();

vi.mock("@/lib/notifications/notification-targets", () => ({
  bumpChatRoomTargetFromMessengerParticipant: (...a: unknown[]) => bumpChatRoomTargetFromMessengerParticipant(...a),
  bumpNotificationTarget: (...a: unknown[]) => bumpNotificationTarget(...a),
  clearChatRoomTargetFromMessengerRead: vi.fn(),
  clearNotificationTarget: vi.fn(),
}));

const listActiveGroupRecipientUserIds = vi.fn();
vi.mock("@/lib/community-messenger/group/group-active-membership-gate", () => ({
  listActiveGroupRecipientUserIds: (...a: unknown[]) => listActiveGroupRecipientUserIds(...a),
}));

import {
  bumpMessengerRoomTargetsForRecipientsParallel,
  MESSENGER_TARGET_BUMP_PARALLEL_CONCURRENCY,
} from "@/lib/notifications/notification-target-messenger-bridge";

type Tables = Record<string, { single?: unknown; list?: unknown[] }>;

function fakeSb(tables: Tables) {
  const fromCalls: string[] = [];
  return {
    fromCalls,
    from(table: string) {
      fromCalls.push(table);
      const t = tables[table] ?? {};
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.maybeSingle = async () => ({ data: t.single ?? null, error: null });
      chain.then = (resolve: (v: unknown) => void) => resolve({ data: t.list ?? [], error: null });
      return chain;
    },
  };
}

describe("bumpMessengerRoomTargetsForRecipientsParallel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bumpChatRoomTargetFromMessengerParticipant.mockResolvedValue(undefined);
    bumpNotificationTarget.mockResolvedValue(undefined);
  });

  it("1:1 general: bumps active peer only — left participant excluded (B8)", async () => {
    const sb = fakeSb({
      community_messenger_rooms: { single: { room_type: "direct", direct_key: "a:b" } },
      community_messenger_participants: {
        list: [
          { user_id: "sender", left_at: null },
          { user_id: "peer", left_at: null },
          { user_id: "gone", left_at: "2026-11-01T00:00:00Z" },
        ],
      },
      store_orders: { single: null },
    });
    const res = await bumpMessengerRoomTargetsForRecipientsParallel(sb as never, { roomId: "r1", fromUserId: "sender" });
    expect(res?.recipientIds).toEqual(["peer"]);
    expect(bumpChatRoomTargetFromMessengerParticipant).toHaveBeenCalledTimes(1);
    expect(bumpChatRoomTargetFromMessengerParticipant).toHaveBeenCalledWith(
      sb,
      expect.objectContaining({ userId: "peer", roomId: "r1", isOwnerOrderChat: false, storeId: null })
    );
  });

  it("group: recipients from active group list, bumped concurrently with cap", async () => {
    const ids = Array.from({ length: 20 }, (_, i) => `u${i}`);
    listActiveGroupRecipientUserIds.mockResolvedValue(ids);
    let inFlight = 0;
    let peak = 0;
    bumpChatRoomTargetFromMessengerParticipant.mockImplementation(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight -= 1;
    });
    const sb = fakeSb({
      community_messenger_rooms: { single: { room_type: "private_group", direct_key: null } },
      community_messenger_participants: { list: [] },
      store_orders: { single: null },
    });
    const res = await bumpMessengerRoomTargetsForRecipientsParallel(sb as never, { roomId: "g1", fromUserId: "sender" });
    expect(res?.kind).toBe("group");
    expect(bumpChatRoomTargetFromMessengerParticipant).toHaveBeenCalledTimes(20);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(MESSENGER_TARGET_BUMP_PARALLEL_CONCURRENCY);
  });

  it("trade: product_chats read once, trade target per recipient with sender as actor", async () => {
    const sb = fakeSb({
      community_messenger_rooms: { single: { room_type: "direct", direct_key: "trade_pc:x" } },
      community_messenger_participants: { list: [{ user_id: "sender", left_at: null }, { user_id: "buyer", left_at: null }] },
      store_orders: { single: null },
      product_chats: { single: { post_id: "p1", seller_id: "sender", buyer_id: "buyer" } },
    });
    await bumpMessengerRoomTargetsForRecipientsParallel(sb as never, { roomId: "t1", fromUserId: "sender" });
    expect(sb.fromCalls.filter((t) => t === "product_chats")).toHaveLength(1);
    expect(bumpNotificationTarget).toHaveBeenCalledWith(
      sb,
      expect.objectContaining({ userId: "buyer", targetType: "trade", actorUserId: "sender", roomId: "t1" })
    );
  });

  it("one recipient failure does not stop others", async () => {
    listActiveGroupRecipientUserIds.mockResolvedValue(["a", "b", "c"]);
    bumpChatRoomTargetFromMessengerParticipant.mockImplementation(async (_sb: unknown, o: { userId: string }) => {
      if (o.userId === "a") throw new Error("boom");
    });
    const sb = fakeSb({
      community_messenger_rooms: { single: { room_type: "open_group", direct_key: null } },
      community_messenger_participants: { list: [] },
      store_orders: { single: null },
    });
    await expect(
      bumpMessengerRoomTargetsForRecipientsParallel(sb as never, { roomId: "g1", fromUserId: "s" })
    ).resolves.not.toBeNull();
    expect(bumpChatRoomTargetFromMessengerParticipant).toHaveBeenCalledTimes(3);
  });
});
