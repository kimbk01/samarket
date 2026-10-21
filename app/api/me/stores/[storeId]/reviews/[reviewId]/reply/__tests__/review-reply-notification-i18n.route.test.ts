/**
 * OPS-10 — 리뷰 답글 알림 제목·본문이 주문자 언어(profiles.preferred_language)로 나간다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const appendUserNotification = vi.fn(async () => true);
let buyerLanguage: string | null;

function makeSb() {
  return {
    from(table: string) {
      const b: Record<string, unknown> = {
        select: () => b,
        eq: () => b,
        update: () => b,
        maybeSingle: async () => {
          if (table === "profiles") return { data: { preferred_language: buyerLanguage }, error: null };
          return {
            data: { id: "r-1", order_id: "o-1", store_id: "store-1", buyer_user_id: "buyer-1", owner_reply_content: null },
            error: null,
          };
        },
        then: (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null }),
      };
      return b;
    },
  };
}

vi.mock("@/lib/auth/get-route-user-id", () => ({ getRouteUserId: async () => "owner-1" }));
vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => makeSb() }));
vi.mock("@/lib/stores/owner-product-gate", () => ({
  getStoreIfOwner: async () => ({ ok: true }),
  getStoreIfOwnerForOperationalWrite: async () => ({ ok: true, store: { id: "store-1" } }),
}));
vi.mock("@/lib/notifications/append-user-notification", () => ({
  appendUserNotification: (...a: unknown[]) => appendUserNotification(...(a as [])),
}));
vi.mock("@/lib/delivery/customer/buyer-store-orders-list-snapshot-cache", () => ({
  invalidateBuyerStoreOrdersListSnapshot: vi.fn(),
}));
vi.mock("@/lib/stores/store-order-detail-snapshot-cache", () => ({ invalidateStoreOrderDetailSnapshot: vi.fn() }));

import { PATCH } from "@/app/api/me/stores/[storeId]/reviews/[reviewId]/reply/route";

const ctx = { params: Promise.resolve({ storeId: "store-1", reviewId: "r-1" }) };
function req(reply: string) {
  return new Request("http://x", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reply }),
  }) as never;
}

describe("OPS-10 review owner-reply notification language", () => {
  beforeEach(() => {
    appendUserNotification.mockClear();
  });

  it.each([
    ["en", "The owner replied to your review", "Owner reply: Thanks!"],
    ["ko", "사장님이 리뷰에 댓글을 남겼어요", "사장님 답글: Thanks!"],
  ])("buyer language %s", async (lang, title, body) => {
    buyerLanguage = lang;
    const res = await PATCH(req("Thanks!"), ctx);
    expect(res.status).toBe(200);
    expect(appendUserNotification).toHaveBeenCalledTimes(1);
    const n = (appendUserNotification.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(n).toMatchObject({
      title,
      body,
      dedupe_key: "owner_reply_r-1",
    });
  });
});
