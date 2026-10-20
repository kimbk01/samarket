import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  storeInquiryRowHref,
  storeInquiryStatusBadgeClass,
  storeInquiryStatusTone,
} from "@/lib/mypage/store-inquiry-ui";

describe("S34 매장 문의 내역 행 규칙", () => {
  it("답변 대기 = warning-soft, 답변 완료 = success-soft", () => {
    expect(storeInquiryStatusTone("open")).toBe("waiting");
    expect(storeInquiryStatusTone("escalated")).toBe("waiting");
    expect(storeInquiryStatusTone("answered")).toBe("done");
    expect(storeInquiryStatusTone("closed")).toBe("done");
    expect(storeInquiryStatusBadgeClass("open")).toContain("bg-sam-warning-soft");
    expect(storeInquiryStatusBadgeClass("answered")).toContain("bg-sam-success-soft");
  });

  it("행 → 매장 화면 /stores/{slug}; slug 없으면 링크 없음", () => {
    expect(storeInquiryRowHref("my shop")).toBe("/stores/my%20shop");
    expect(storeInquiryRowHref("")).toBeNull();
    expect(storeInquiryRowHref(undefined)).toBeNull();
  });
});

/* ── A10 GET /api/me/store-inquiries: store_slug 포함 · 오류 코드만(원문 미노출) ── */
let inquiriesRes: { data: unknown; error: { message: string } | null };
vi.mock("@/lib/auth/get-route-user-id", () => ({ getRouteUserId: async () => "u1" }));
vi.mock("@/lib/stores/try-supabase-stores", () => ({
  tryGetSupabaseForStores: () => ({
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "order", "in"]) q[m] = () => q;
      q.limit = async () => inquiriesRes;
      q.then = (resolve: (v: unknown) => unknown) =>
        resolve(
          table === "stores"
            ? { data: [{ id: "s1", store_name: "Shop One", slug: "shop-one" }], error: null }
            : inquiriesRes
        );
      return q;
    },
  }),
}));

describe("A10 GET /api/me/store-inquiries", () => {
  beforeEach(() => {
    inquiriesRes = {
      data: [{ id: "i1", store_id: "s1", subject: "Q", content: "c", status: "open", created_at: "2026-10-01T00:00:00Z" }],
      error: null,
    };
  });

  it("각 행에 store_name + store_slug", async () => {
    const { GET } = await import("@/app/api/me/store-inquiries/route");
    const res = await GET();
    const json = (await res.json()) as { ok: boolean; inquiries: Array<Record<string, unknown>> };
    expect(json.ok).toBe(true);
    expect(json.inquiries[0]).toMatchObject({ store_name: "Shop One", store_slug: "shop-one" });
  });

  it("DB 오류는 500 + 오류 코드만 — DB 원문 메시지 노출 없음", async () => {
    inquiriesRes = { data: null, error: { message: "relation secret_table does not exist" } };
    const { GET } = await import("@/app/api/me/store-inquiries/route");
    const res = await GET();
    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("store_inquiries_load_failed");
    expect(JSON.stringify(json)).not.toContain("secret_table");
  });
});
