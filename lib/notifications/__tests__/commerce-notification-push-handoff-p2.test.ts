import { describe, expect, it, vi } from "vitest";
import {
  classifyCommercePushHandoffError,
  commercePushHandoffBackoffMs,
  COMMERCE_PUSH_HANDOFF_MAX_ATTEMPTS,
  isCommercePushManagedEventType,
} from "@/lib/notifications/commerce-notification-push-handoff";

describe("SR-1 P2 commerce push handoff contract", () => {
  it("manages only order_status / delivery_status", () => {
    expect(isCommercePushManagedEventType("order_status")).toBe(true);
    expect(isCommercePushManagedEventType("delivery_status")).toBe(true);
    expect(isCommercePushManagedEventType("chat_message")).toBe(false);
  });

  it("backoff grows but caps", () => {
    expect(commercePushHandoffBackoffMs(1)).toBe(2 * 60_000);
    expect(commercePushHandoffBackoffMs(2)).toBe(4 * 60_000);
    expect(commercePushHandoffBackoffMs(10)).toBe(60 * 60_000);
  });

  it("classifies permanent vs transient provider errors", () => {
    expect(classifyCommercePushHandoffError(new Error("UNREGISTERED")).permanent).toBe(true);
    expect(classifyCommercePushHandoffError(new Error("timeout")).permanent).toBe(false);
  });

  it("max attempts is finite", () => {
    expect(COMMERCE_PUSH_HANDOFF_MAX_ATTEMPTS).toBeGreaterThan(1);
    expect(COMMERCE_PUSH_HANDOFF_MAX_ATTEMPTS).toBeLessThanOrEqual(20);
  });

  it("append commerce path uses deferPush + pending mark", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(join(process.cwd(), "lib/notifications/append-user-notification.ts"), "utf8");
    expect(src).toContain("commerceDurablePush");
    expect(src).toContain("deferPush: true");
    expect(src).toContain("markCommercePushHandoffPending");
  });

  it("cron retry owner exists and is scheduled", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const route = readFileSync(
      join(process.cwd(), "app/api/cron/commerce-notification-push-handoff/route.ts"),
      "utf8"
    );
    const vercel = readFileSync(join(process.cwd(), "vercel.json"), "utf8");
    expect(route).toContain("reconcileCommerceNotificationIntentsFromStoreOrderEvents");
    expect(route).toContain("claimCommercePushHandoffEvents");
    expect(route).toContain("processClaimedCommercePushHandoff");
    expect(vercel).toContain("/api/cron/commerce-notification-push-handoff");
  });

  it("payment/status paths await durable intent (not void)", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const payment = readFileSync(join(process.cwd(), "lib/stores/record-store-order-payment.ts"), "utf8");
    const status = readFileSync(
      join(process.cwd(), "lib/stores/apply-store-order-status-transition.ts"),
      "utf8"
    );
    expect(payment).not.toMatch(/void notify(StoreOwner|BuyerStore)/);
    expect(status).not.toMatch(/void notify(StoreOwner|BuyerStore)/);
    expect(payment).toMatch(/await notifyStoreOwnerPaymentCompleted/);
    expect(status).toMatch(/await notifyBuyerStoreOrderOwnerStatus/);
  });

  it("failure injection: first fail stays recoverable then handoff", async () => {
    const dispatchNotificationEvent = vi.fn();
    vi.doMock("@/lib/notifications/pipeline/notification-event-dispatcher", () => ({
      dispatchNotificationEvent,
    }));

    const updates: Array<Record<string, unknown>> = [];
    const sb = {
      from: () => ({
        update: (payload: Record<string, unknown>) => ({
          eq: () => ({
            eq: async () => {
              updates.push(payload);
              return { error: null };
            },
          }),
        }),
      }),
    } as never;

    dispatchNotificationEvent
      .mockRejectedValueOnce(new Error("temporary_provider_timeout"))
      .mockResolvedValueOnce(undefined);

    const {
      processClaimedCommercePushHandoff,
    } = await import("@/lib/notifications/commerce-notification-push-handoff");

    const baseRow = {
      id: "evt-1",
      user_id: "u1",
      type: "order_status",
      category: "store",
      room_id: null,
      call_session_id: null,
      actor_user_id: null,
      message_id: null,
      title: "t",
      body: "b",
      display_payload: {},
      unread: true,
      read_at: null,
      delivered_at: null,
      opened_at: null,
      muted_snapshot: false,
      push_suppressed_reason: null,
      sound_suppressed_reason: null,
      dedupe_key: "commerce:owner:new_order:o1",
      created_at: new Date().toISOString(),
      push_handoff_attempts: 1,
      push_handoff_claim_token: "tok-1",
      _claimToken: "tok-1",
    };

    const first = await processClaimedCommercePushHandoff(sb, baseRow as never);
    expect(first).toBe("retryable");
    expect(updates.at(-1)?.push_handoff_status).toBe("retryable");

    const second = await processClaimedCommercePushHandoff(sb, {
      ...baseRow,
      push_handoff_attempts: 2,
    } as never);
    expect(second).toBe("handed_off");
    expect(updates.at(-1)?.push_handoff_status).toBe("handed_off");
  });

  it("dead auto-complete helper stays unwired", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const cron = readFileSync(
      join(process.cwd(), "app/api/cron/store-orders-auto-complete/route.ts"),
      "utf8"
    );
    expect(cron).not.toContain("notifyBuyerStoreOrderAutoCompleted");
    expect(cron).toContain("applyStoreOrderStatusTransition");
  });
});
