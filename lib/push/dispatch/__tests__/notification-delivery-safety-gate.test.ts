import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NotificationEventRow } from "@/lib/notifications/core/notification-event-schema";
import { evaluateNotificationDeliverySafety } from "@/lib/push/dispatch/notification-delivery-safety-gate";

const isNotificationBlockedForRecipient = vi.fn();

vi.mock("@/lib/notifications/policy/notification-block-policy", () => ({
  isNotificationBlockedForRecipient: (...args: unknown[]) =>
    isNotificationBlockedForRecipient(...args),
}));

function row(
  overrides: Partial<NotificationEventRow> = {}
): NotificationEventRow {
  return {
    id: "event-1",
    user_id: "recipient-1",
    type: "chat_message",
    category: "chat_message",
    room_id: "11111111-1111-4111-8111-111111111111",
    call_session_id: null,
    actor_user_id: "actor-1",
    message_id: "message-1",
    title: "title",
    body: "body",
    display_payload: {},
    unread: true,
    read_at: null,
    delivered_at: null,
    opened_at: null,
    muted_snapshot: false,
    push_suppressed_reason: null,
    sound_suppressed_reason: null,
    dedupe_key: "event-1",
    created_at: "2026-07-31T00:00:00.000Z",
    ...overrides,
  };
}

function supabaseFor(
  rows: Record<string, { data: unknown; error: unknown }>
) {
  return {
    from: vi.fn((table: string) => {
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        is: vi.fn(() => chain),
        maybeSingle: vi.fn(async () => rows[table] ?? { data: null, error: null }),
      };
      return chain;
    }),
  } as never;
}

describe("notification delivery safety gate", () => {
  beforeEach(() => {
    isNotificationBlockedForRecipient.mockReset();
    isNotificationBlockedForRecipient.mockResolvedValue(false);
  });

  it("suppresses expired durable events before target loading", async () => {
    const decision = await evaluateNotificationDeliverySafety(
      supabaseFor({}),
      row({ created_at: "2026-07-01T00:00:00.000Z" }),
      Date.parse("2026-07-31T00:00:00.000Z")
    );
    expect(decision).toEqual({ allow: false, reason: "event_expired" });
  });

  it("rechecks actor blocks at delivery time", async () => {
    isNotificationBlockedForRecipient.mockResolvedValue(true);
    const decision = await evaluateNotificationDeliverySafety(
      supabaseFor({}),
      row(),
      Date.parse("2026-07-31T00:01:00.000Z")
    );
    expect(decision).toEqual({ allow: false, reason: "blocked" });
  });

  it("suppresses active group bans", async () => {
    const decision = await evaluateNotificationDeliverySafety(
      supabaseFor({
        community_messenger_rooms: {
          data: {
            id: "room-1",
            room_type: "private_group",
            room_status: "active",
            deleted_at: null,
          },
          error: null,
        },
        community_messenger_participants: {
          data: { user_id: "recipient-1", left_at: null },
          error: null,
        },
        community_messenger_group_bans: {
          data: { id: "ban-1" },
          error: null,
        },
      }),
      row({ type: "group_message", category: "group_message" }),
      Date.parse("2026-07-31T00:01:00.000Z")
    );
    expect(decision).toEqual({ allow: false, reason: "group_banned" });
  });

  it("suppresses deleted legacy trade rooms", async () => {
    const decision = await evaluateNotificationDeliverySafety(
      supabaseFor({
        community_messenger_rooms: { data: null, error: null },
        product_chats: { data: null, error: null },
      }),
      row({ type: "trade_message", category: "trade_message" }),
      Date.parse("2026-07-31T00:01:00.000Z")
    );
    expect(decision).toEqual({
      allow: false,
      reason: "destination_deleted",
    });
  });

  describe("P-1 order_status rows that are not store orders", () => {
    const at = Date.parse("2026-07-31T00:01:00.000Z");
    const orderStatus = (display_payload: Record<string, unknown>) =>
      row({
        type: "order_status",
        category: "order_status",
        room_id: null,
        actor_user_id: null,
        display_payload,
      });

    it("allows mandatory member point charge results (legacyRefId = charge request id)", async () => {
      const decision = await evaluateNotificationDeliverySafety(
        supabaseFor({ store_orders: { data: null, error: null } }),
        orderStatus({
          legacyRefId: "charge-request-1",
          legacyMeta: { kind: "user_point_charge_approved" },
        }),
        at
      );
      expect(decision).toEqual({ allow: true });
    });

    it("allows delivery ad results (legacyRefId = ad request id)", async () => {
      const decision = await evaluateNotificationDeliverySafety(
        supabaseFor({ store_orders: { data: null, error: null } }),
        orderStatus({
          legacyRefId: "ad-request-1",
          legacyMeta: { kind: "delivery_ad_rejected" },
        }),
        at
      );
      expect(decision).toEqual({ allow: true });
    });

    it("still suppresses store order notifications whose order is gone", async () => {
      const decision = await evaluateNotificationDeliverySafety(
        supabaseFor({ store_orders: { data: null, error: null } }),
        orderStatus({
          legacyRefId: "order-1",
          legacyMeta: { kind: "store_order_created", order_id: "order-1" },
        }),
        at
      );
      expect(decision).toEqual({ allow: false, reason: "destination_deleted" });
    });

    it("still checks legacy store order rows that only carry legacyRefId", async () => {
      const decision = await evaluateNotificationDeliverySafety(
        supabaseFor({ store_orders: { data: null, error: null } }),
        orderStatus({
          legacyRefId: "order-2",
          legacyMeta: { kind: "store_order_owner_status" },
        }),
        at
      );
      expect(decision).toEqual({ allow: false, reason: "destination_deleted" });
    });

    it("still forbids store order notifications for non-participants", async () => {
      const decision = await evaluateNotificationDeliverySafety(
        supabaseFor({
          store_orders: {
            data: { id: "order-3", buyer_user_id: "buyer-x", stores: { owner_user_id: "owner-x" } },
            error: null,
          },
        }),
        orderStatus({ legacyMeta: { kind: "store_order_owner_status", order_id: "order-3" } }),
        at
      );
      expect(decision).toEqual({ allow: false, reason: "destination_forbidden" });
    });
  });

  describe("P-14 trade_status rows whose legacyRefId is not a product id", () => {
    const at = Date.parse("2026-07-31T00:01:00.000Z");
    const tradeStatus = (display_payload: Record<string, unknown>) =>
      row({
        type: "trade_status",
        category: "trade_status",
        room_id: null,
        actor_user_id: null,
        display_payload,
      });
    const completed = tradeStatus({
      legacyRefId: "cm-room-1",
      legacyMeta: { kind: "trade_completed", room_id: "cm-room-1", product_chat_id: "pc-1" },
    });

    it("allows trade completed for a party of the trade chat (legacyRefId = messenger room id)", async () => {
      const decision = await evaluateNotificationDeliverySafety(
        supabaseFor({
          posts: { data: null, error: null },
          product_chats: {
            data: { id: "pc-1", seller_id: "seller-1", buyer_id: "recipient-1", room_status: "active" },
            error: null,
          },
        }),
        completed,
        at
      );
      expect(decision).toEqual({ allow: true });
    });

    it("suppresses trade completed when the trade chat is gone", async () => {
      const decision = await evaluateNotificationDeliverySafety(
        supabaseFor({ product_chats: { data: null, error: null } }),
        completed,
        at
      );
      expect(decision).toEqual({ allow: false, reason: "destination_deleted" });
    });

    it("forbids trade completed for a non-party", async () => {
      const decision = await evaluateNotificationDeliverySafety(
        supabaseFor({
          product_chats: {
            data: { id: "pc-1", seller_id: "seller-x", buyer_id: "buyer-x", room_status: "active" },
            error: null,
          },
        }),
        completed,
        at
      );
      expect(decision).toEqual({ allow: false, reason: "destination_forbidden" });
    });

    it("allows sanction results (legacyRefId = sanction id)", async () => {
      const decision = await evaluateNotificationDeliverySafety(
        supabaseFor({ posts: { data: null, error: null } }),
        tradeStatus({ legacyRefId: "sanction-1", legacyMeta: { kind: "trade_sanction", action: "applied" } }),
        at
      );
      expect(decision).toEqual({ allow: true });
    });

    it("still suppresses notifications whose explicit product is gone", async () => {
      const decision = await evaluateNotificationDeliverySafety(
        supabaseFor({ posts: { data: null, error: null } }),
        tradeStatus({ legacyRefId: "offer-1", legacyMeta: { kind: "trade_offer", product_id: "post-1" } }),
        at
      );
      expect(decision).toEqual({ allow: false, reason: "destination_deleted" });
    });
  });

  it("runs before target loading and records suppression reasons", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "lib/push/dispatch/dispatch-push-for-user.ts"
      ),
      "utf8"
    );
    const safetyAt = source.indexOf(
      "evaluateNotificationDeliverySafety("
    );
    const targetsAt = source.indexOf(
      "loadActivePushTargets(",
      safetyAt
    );
    expect(safetyAt).toBeGreaterThan(-1);
    expect(targetsAt).toBeGreaterThan(safetyAt);
    expect(source).toContain(
      "provider_response: { reason: safety.reason }"
    );
    expect(source).toContain(
      'provider_response: { reason: "user_settings_gate" }'
    );
  });
});
