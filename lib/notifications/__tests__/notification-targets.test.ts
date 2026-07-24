import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  bumpNotificationTarget,
  clearNotificationTarget,
  invalidateBadgeTargetCaches,
} from "@/lib/notifications/notification-targets";

const invalidateNotificationUnreadCountCache = vi.fn();
const invalidateUserChatUnreadCache = vi.fn();
const invalidateCommunityMessengerUnreadTotalCache = vi.fn();
const invalidateOwnerHubBadgeCache = vi.fn();

vi.mock("@/lib/notifications/notification-unread-count-cache", () => ({
  invalidateNotificationUnreadCountCache: (...a: unknown[]) =>
    invalidateNotificationUnreadCountCache(...a),
}));
vi.mock("@/lib/chat/user-chat-unread-parts", () => ({
  invalidateUserChatUnreadCache: (...a: unknown[]) => invalidateUserChatUnreadCache(...a),
}));
vi.mock("@/lib/community-messenger/community-messenger-unread-total", () => ({
  invalidateCommunityMessengerUnreadTotalCache: (...a: unknown[]) =>
    invalidateCommunityMessengerUnreadTotalCache(...a),
}));
vi.mock("@/lib/chats/owner-hub-badge-cache", () => ({
  invalidateOwnerHubBadgeCache: (...a: unknown[]) => invalidateOwnerHubBadgeCache(...a),
}));

describe("notification-targets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("skips cache invalidation when RPC returns false (already-unread no-op)", async () => {
    const sb = mockSb(() => ({ data: false, error: null }));
    await bumpNotificationTarget(sb, {
      userId: "user-a",
      targetType: "chat_room",
      targetId: "room-1",
    });
    expect(sb.rpc).toHaveBeenCalledOnce();
    expect(invalidateNotificationUnreadCountCache).not.toHaveBeenCalled();
    expect(invalidateUserChatUnreadCache).not.toHaveBeenCalled();
    expect(invalidateCommunityMessengerUnreadTotalCache).not.toHaveBeenCalled();
    expect(invalidateOwnerHubBadgeCache).not.toHaveBeenCalled();
  });

  it("invalidates caches when RPC returns true (real write)", async () => {
    const sb = mockSb(() => ({ data: true, error: null }));
    await bumpNotificationTarget(sb, {
      userId: "user-a",
      targetType: "chat_room",
      targetId: "room-1",
    });
    expect(invalidateNotificationUnreadCountCache).toHaveBeenCalledTimes(1);
    expect(invalidateOwnerHubBadgeCache).toHaveBeenCalledTimes(1);
  });

  it("invalidates caches when RPC returns null (legacy void RPC compat)", async () => {
    const sb = mockSb(() => ({ data: null, error: null }));
    await bumpNotificationTarget(sb, {
      userId: "user-a",
      targetType: "chat_room",
      targetId: "room-1",
    });
    expect(invalidateNotificationUnreadCountCache).toHaveBeenCalledTimes(1);
  });
});
