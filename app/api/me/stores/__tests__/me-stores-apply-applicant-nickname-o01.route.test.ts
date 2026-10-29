/**
 * 묶음 4 · O-01 / DB-3 — POST /api/me/stores (매장 신청)
 * 신청자 닉네임은 필수 수집값: 컬럼이 없다는 오류에서 닉네임을 빼고 성공 응답하던 조용한 처리를 제거 →
 * 503 applicant_nickname_save_failed, 재시도 insert 없음. 정상 저장 시 insert 에 applicant_nickname 포함.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
let inserts: Row[];
let insertResults: Array<{ data: Row | null; error: { code?: string; message: string } | null }>;

function makeSb() {
  return {
    from(table: string) {
      let inserting = false;
      const b = {
        select: () => b,
        eq: () => b,
        in: () => b,
        limit: async () => ({ data: [], error: null }),
        insert: (row: Row) => {
          inserting = true;
          inserts.push({ ...row });
          return b;
        },
        maybeSingle: async () => {
          if (inserting) return insertResults.shift() ?? { data: { id: "new-store" }, error: null };
          if (table === "store_categories") return { data: { id: "cat-1", name: "음식", slug: "food" }, error: null };
          if (table === "store_topics") return { data: { id: "top-1", name: "한식", slug: "korean" }, error: null };
          return { data: null, error: null };
        },
      };
      return b;
    },
  };
}

vi.mock("@/lib/auth/get-route-user-id", () => ({ getRouteUserId: async () => "user-1" }));
vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => makeSb() }));
vi.mock("@/lib/me/load-me-stores-for-user", () => ({
  loadMeStoresListForUser: vi.fn(),
  invalidateMeStoresListServerCache: vi.fn(),
}));
vi.mock("@/lib/addresses/user-address-service", () => ({
  getUserAddressDefaults: async () => ({ master: { id: "addr-1" } }),
}));
vi.mock("@/lib/addresses/address-book-card-presentation", () => ({
  formatAddressBookCardPresentation: () => ({ label: "Home" }),
}));

import { POST } from "@/app/api/me/stores/route";

const req = () =>
  new Request("http://localhost/api/me/stores", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      applicantNickname: "사장님",
      shopName: "테스트 식당",
      storeSlug: "test-shop",
      categoryPrimarySlug: "food",
      categorySubSlug: "korean",
    }),
  }) as never;

beforeEach(() => {
  inserts = [];
  insertResults = [];
});

describe("O-01 매장 신청 — 신청자 닉네임 저장", () => {
  it("정상: insert 에 applicant_nickname 포함, 200", async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(inserts).toHaveLength(1);
    expect(inserts[0]!.applicant_nickname).toBe("사장님");
  });

  it("컬럼 부재 오류 → 닉네임을 빼고 재시도하지 않고 503 applicant_nickname_save_failed", async () => {
    insertResults = [
      {
        data: null,
        error: { code: "PGRST204", message: "Could not find the 'applicant_nickname' column of 'stores' in the schema cache" },
      },
    ];
    const res = await POST(req());
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toBe("applicant_nickname_save_failed");
    expect(inserts).toHaveLength(1);
  });
});
