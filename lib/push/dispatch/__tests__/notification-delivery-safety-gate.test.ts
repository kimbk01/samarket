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
