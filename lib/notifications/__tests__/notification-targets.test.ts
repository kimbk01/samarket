import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  bumpNotificationTarget,
  clearNotificationTarget,
  invalidateBadgeTargetCaches,
} from "@/lib/notifications/notification-targets";

describe("notification-targets", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function mockSb(rpcImpl: (name: string, args: Record<string, unknown>) => { data?: unknown; error?: null }) {
    return {
      rpc: vi.fn((name: string, args: Record<string, unknown>) => Promise.resolve(rpcImpl(name, args))),
    } as unknown as import("@supabase/supabase-js").SupabaseClient<any>;
  }

  it("bump calls upsert RPC with trimmed ids", async () => {
    const sb = mockSb((name, args) => {
      expect(name).toBe("upsert_notification_target_unread");
      expect(args.p_user_id).toBe("user-a");
      expect(args.p_target_type).toBe("buyer_order");
      expect(args.p_target_id).toBe("order-1");
      expect(args.p_room_id).toBeNull();
      return { data: null, error: null };
    });
    await bumpNotificationTarget(sb, {
      userId: " user-a ",
      targetType: "buyer_order",
      targetId: " order-1 ",
      scope: "consumer",
    });
    expect(sb.rpc).toHaveBeenCalledOnce();
  });

  it("clear is no-op when ids empty", async () => {
    const sb = mockSb(() => ({ data: null, error: null }));
    await clearNotificationTarget(sb, { userId: "", targetType: "trade", targetId: "x" });
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("invalidateBadgeTargetCaches does not throw for empty user", () => {
    expect(() => invalidateBadgeTargetCaches("")).not.toThrow();
  });
});
