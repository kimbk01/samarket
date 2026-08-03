import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const invalidateOwnerHubBadgeCache = vi.fn();
const invalidateNotificationBadgeCache = vi.fn();
const fetchDomainBadgeAuthorityPayload = vi.fn();
const resolveRoomReadableTipMessageId = vi.fn();

vi.mock("@/lib/chats/owner-hub-badge-cache", () => ({
  invalidateOwnerHubBadgeCache: (...args: unknown[]) => invalidateOwnerHubBadgeCache(...args),
}));

vi.mock("@/lib/notifications/pipeline/notify-badge-service", () => ({
  invalidateNotificationBadgeCache: (...args: unknown[]) => invalidateNotificationBadgeCache(...args),
  fetchDomainBadgeAuthorityPayload: (...args: unknown[]) => fetchDomainBadgeAuthorityPayload(...args),
}));

vi.mock("@/lib/community-messenger/room-unread-authority-rpc", async () => {
  const actual = await vi.importActual<typeof import("@/lib/community-messenger/room-unread-authority-rpc")>(
    "@/lib/community-messenger/room-unread-authority-rpc"
  );
  return {
    ...actual,
    resolveRoomReadableTipMessageId: (...args: unknown[]) => resolveRoomReadableTipMessageId(...args),
  };
});

import { readOrderChat } from "@/lib/order-domain/read-order-chat";

const OWNER = "owner-user-1";
const BUYER = "buyer-user-1";
const ORDER = "order-1";
const ROOM = "room-1";
const STORE = "store-a";

function makeSb(opts: {
  role: "owner" | "customer";
  rpcOk?: boolean;
  unreadAfter?: number;
  rpcError?: { message: string } | null;
}) {
  const ownerId = OWNER;
  const buyerId = BUYER;
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              id: ORDER,
              store_id: STORE,
              buyer_user_id: buyerId,
              community_messenger_room_id: ROOM,
              stores: { owner_user_id: ownerId },
            },
            error: null,
          }),
        }),
      }),
    }),
    rpc: async () => {
      if (opts.rpcError) return { data: null, error: opts.rpcError };
      if (opts.rpcOk === false) {
        return { data: { ok: false, error: "mark_room_read_denied" }, error: null };
      }
      return {
        data: {
          ok: true,
          unreadCount: opts.unreadAfter ?? 0,
          clearedTargetCount: 0,
          clearedEventCount: 0,
        },
        error: null,
      };
    },
  } as any;
}

describe("readOrderChat owner Hub route-cache invalidate (Slice 2-4 R2)", () => {
  const src = readFileSync(join(process.cwd(), "lib/order-domain/read-order-chat.ts"), "utf8");

  beforeEach(() => {
    invalidateOwnerHubBadgeCache.mockReset();
    invalidateNotificationBadgeCache.mockReset();
    fetchDomainBadgeAuthorityPayload.mockReset();
    resolveRoomReadableTipMessageId.mockReset();
    resolveRoomReadableTipMessageId.mockResolvedValue("tip-1");
    fetchDomainBadgeAuthorityPayload.mockResolvedValue({
      projection: { bellTotal: 0, appIconTotal: 0 },
    });
  });

  it("source: owner success path calls invalidateOwnerHubBadgeCache once (not memory-only)", () => {
    expect(src).toContain("invalidateOwnerHubBadgeCache");
    expect(src).toContain('ctx.role === "owner"');
    expect(src).not.toContain("invalidateHubStoreOrderUnreadMemory");
  });

  it("owner read success → invalidateOwnerHubBadgeCache(userId) once", async () => {
    const res = await readOrderChat(makeSb({ role: "owner" }), {
      userId: OWNER,
      orderId: ORDER,
      roomId: ROOM,
      role: "owner",
    });
    expect(res.ok).toBe(true);
    expect(invalidateOwnerHubBadgeCache).toHaveBeenCalledTimes(1);
    expect(invalidateOwnerHubBadgeCache).toHaveBeenCalledWith(OWNER);
    expect(invalidateNotificationBadgeCache).toHaveBeenCalledWith(OWNER);
  });

  it("customer read success → does not invalidate owner Hub cache", async () => {
    const res = await readOrderChat(makeSb({ role: "customer" }), {
      userId: BUYER,
      orderId: ORDER,
      roomId: ROOM,
      role: "customer",
    });
    expect(res.ok).toBe(true);
    expect(invalidateOwnerHubBadgeCache).not.toHaveBeenCalled();
    expect(invalidateNotificationBadgeCache).toHaveBeenCalledWith(BUYER);
  });

  it("read failure → no Hub cache invalidate", async () => {
    const denied = await readOrderChat(makeSb({ role: "owner", rpcOk: false }), {
      userId: OWNER,
      orderId: ORDER,
      roomId: ROOM,
      role: "owner",
    });
    expect(denied.ok).toBe(false);
    expect(invalidateOwnerHubBadgeCache).not.toHaveBeenCalled();
  });

  it("partial read (unreadAfter>0) → success + Hub invalidate", async () => {
    // Final stabilization: visible-range / partial mark-read may leave remaining unread.
    const partial = await readOrderChat(makeSb({ role: "owner", unreadAfter: 2 }), {
      userId: OWNER,
      orderId: ORDER,
      roomId: ROOM,
      role: "owner",
    });
    expect(partial.ok).toBe(true);
    if (partial.ok) {
      expect(partial.participantUnreadAfter).toBe(2);
    }
    expect(invalidateOwnerHubBadgeCache).toHaveBeenCalledTimes(1);
    expect(invalidateOwnerHubBadgeCache).toHaveBeenCalledWith(OWNER);
  });

  it("does not patch Hub digits directly (+1/-1 absent)", () => {
    expect(src).not.toMatch(/storeOrderChatUnread\s*[+\-]=/);
    expect(src).not.toMatch(/hubFab\s*[+\-]=/);
  });
});
