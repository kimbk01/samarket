/** ORD-C-09 — 요청사항·줄 메모 서버 길이 상한(거절, 자르지 않음) */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  exceedsStoreOrderNoteMaxLength,
  STORE_ORDER_NOTE_MAX_LENGTH,
} from "@/lib/stores/store-order-note-limits";
import { resolveStoreCheckoutClientError } from "@/lib/stores/resolve-store-checkout-client-error";

const tryGetSupabaseForStores = vi.fn();
const createStoreOrderAtomic = vi.fn();
const validateStoreOrderCheckout = vi.fn();
vi.mock("@/lib/auth/get-route-user-id", () => ({ getRouteUserId: async () => "buyer-1" }));
vi.mock("@/lib/auth/server-guards", () => ({
  validateActiveSession: async () => ({ ok: true, profile: { id: "buyer-1" } }),
}));
vi.mock("@/lib/auth/member-account-state", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  isProductWriteDeniedMemberAccount: () => false,
}));
vi.mock("@/lib/auth/require-signup-complete-api", () => ({
  requireSignupCompleteForUser: async () => ({ ok: true }),
}));
vi.mock("@/lib/profile/require-profile-completion.server", () => ({
  requireProfileFieldsForAction: async () => ({ ok: true }),
}));
vi.mock("@/lib/stores/try-supabase-stores", () => ({
  tryGetSupabaseForStores: () => tryGetSupabaseForStores(),
}));
vi.mock("@/lib/stores/validate-store-order-checkout", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  validateStoreOrderCheckout: (...a: unknown[]) => validateStoreOrderCheckout(...a),
}));
vi.mock("@/lib/stores/create-store-order-atomic", () => ({
  createStoreOrderAtomic: (...a: unknown[]) => createStoreOrderAtomic(...a),
}));

function sbStub() {
  return {
    from: (table: string) => {
      const api: Record<string, unknown> = {
        select: () => api,
        eq: () => api,
        maybeSingle: async () =>
          table === "stores"
            ? {
                data: {
                  id: "store-a",
                  owner_user_id: "owner-1",
                  approval_status: "approved",
                  is_visible: true,
                  store_name: "S",
                  is_open: true,
                  business_hours_json: null,
                },
                error: null,
              }
            : { data: null, error: null },
      };
      return api;
    },
  };
}

function req(body: Record<string, unknown>) {
  return new Request("http://x/api/me/store-orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ store_id: "store-a", fulfillment_type: "pickup", payment_method: "cod", ...body }),
  }) as unknown as import("next/server").NextRequest;
}

describe("ORD-C-09 note length", () => {
  beforeEach(() => {
    tryGetSupabaseForStores.mockReturnValue(sbStub());
    createStoreOrderAtomic.mockReset();
    createStoreOrderAtomic.mockResolvedValue({ ok: false, error: "should_not_be_called", httpStatus: 500 });
    validateStoreOrderCheckout.mockReset();
    validateStoreOrderCheckout.mockResolvedValue({
      ok: true,
      lines: [],
      deliveryFeeAmount: 0,
      paymentGrandTotal: 500,
      paymentTotal: 500,
      productsById: {},
    });
  });

  it("상한 = 클라이언트 maxLength(500), 경계 포함", () => {
    expect(STORE_ORDER_NOTE_MAX_LENGTH).toBe(500);
    expect(exceedsStoreOrderNoteMaxLength("a".repeat(500))).toBe(false);
    expect(exceedsStoreOrderNoteMaxLength("a".repeat(501))).toBe(true);
    expect(exceedsStoreOrderNoteMaxLength(null)).toBe(false);
  });

  it("줄 메모 초과 → 400 line_note_too_long, 검증·주문 RPC 호출 없음", async () => {
    const { POST } = await import("@/app/api/me/store-orders/route");
    const res = await POST(
      req({ items: [{ product_id: "prod-1", qty: 1, client_unit_php: 100, line_note: "x".repeat(501) }] })
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "line_note_too_long", product_id: "prod-1" });
    expect(validateStoreOrderCheckout).not.toHaveBeenCalled();
    expect(createStoreOrderAtomic).not.toHaveBeenCalled();
  });

  it("요청사항 초과 → 400 buyer_note_too_long, 주문 RPC 호출 없음", async () => {
    const { POST } = await import("@/app/api/me/store-orders/route");
    const res = await POST(
      req({
        items: [{ product_id: "prod-1", qty: 1, client_unit_php: 100 }],
        buyer_note: "y".repeat(501),
      })
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "buyer_note_too_long" });
    expect(createStoreOrderAtomic).not.toHaveBeenCalled();
  });

  it("클라이언트 문구는 상한 값을 넣어 표시", () => {
    const t = (k: string, p?: Record<string, string | number>) => (p ? `${k}:${JSON.stringify(p)}` : k);
    expect(resolveStoreCheckoutClientError(t as never, "buyer_note_too_long")).toBe(
      'store_err_buyer_note_too_long:{"max":500}'
    );
    expect(resolveStoreCheckoutClientError(t as never, "line_note_too_long")).toBe(
      'store_err_line_note_too_long:{"max":500}'
    );
  });
});
