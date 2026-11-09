/**
 * 매장 신청 v2 — 보완 요청 매장 「보완 내용 제출」 (POST /api/me/stores/[storeId]/resubmit).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
let storeRow: Row | null;
let updates: { patch: Row; filters: [string, unknown][] }[];
let updateResult: Row | null;
const appendEvent = vi.fn();
const notifyAdmins = vi.fn();

function makeSb() {
  return {
    rpc: async () => ({ data: [], error: null }),
    from(table: string) {
      let patch: Row | null = null;
      const filters: [string, unknown][] = [];
      const b = {
        select: () => b,
        eq: (k: string, v: unknown) => {
          filters.push([k, v]);
          return b;
        },
        update: (p: Row) => {
          patch = p;
          return b;
        },
        maybeSingle: async () => {
          if (patch) {
            updates.push({ patch, filters: [...filters] });
            return { data: updateResult, error: null };
          }
          if (table === "stores") return { data: storeRow, error: null };
          if (table === "store_categories") return { data: { id: "cat-1", name: "음식" }, error: null };
          if (table === "store_topics") return { data: { id: "top-1", name: "한식" }, error: null };
          return { data: null, error: null };
        },
      };
      return b;
    },
  };
}

vi.mock("@/lib/auth/get-route-user-id", () => ({ getRouteUserId: async () => "owner-1" }));
vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => makeSb() }));
vi.mock("@/lib/me/load-me-stores-for-user", () => ({ invalidateMeStoresListServerCache: vi.fn() }));
vi.mock("@/lib/audit/append-audit-log", () => ({ appendAuditLog: async () => undefined }));
vi.mock("@/lib/audit/request-meta", () => ({ getAuditRequestMeta: () => ({ ip: null, userAgent: null }) }));
vi.mock("@/lib/stores/store-public-shared-cache-generation", () => ({ bumpStorePublicSharedCacheGeneration: vi.fn() }));
vi.mock("@/lib/stores/store-location-columns.server", () => ({ computeStoreLocationColumns: () => ({}) }));
vi.mock("@/lib/stores/store-application-events.server", () => ({
  appendStoreApplicationEvent: (...a: unknown[]) => appendEvent(...a),
}));
vi.mock("@/lib/stores/store-application-admin-notify.server", () => ({
  notifyAdminsStoreApplicationSubmitted: (...a: unknown[]) => notifyAdmins(...a),
}));

import { POST } from "@/app/api/me/stores/[storeId]/resubmit/route";

const ctx = { params: Promise.resolve({ storeId: "store-1" }) };
const req = () =>
  new Request("http://localhost/api/me/stores/store-1/resubmit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      applicantNickname: "사장님",
      shopName: "Mandoo Cafe",
      categoryPrimarySlug: "cafe",
      categorySubSlug: "dessert",
      location: { lat: 14.5, lng: 121, formattedAddress: "Pasay", region: "Metro Manila", city: "Pasay", street: "A", detail: "" },
    }),
  }) as never;

beforeEach(() => {
  updates = [];
  updateResult = { id: "store-1", store_name: "Mandoo Cafe", approval_status: "pending" };
  storeRow = { id: "store-1", owner_user_id: "owner-1", approval_status: "revision_requested", phone: "09171234567" };
  appendEvent.mockReset();
  notifyAdmins.mockReset();
});

describe("보완 내용 제출", () => {
  it("보완 요청 상태 → 신청 항목(매장명·업종 포함) 저장 + pending 복귀를 한 번의 조건부 UPDATE 로", async () => {
    const res = await POST(req(), ctx);
    expect(res.status).toBe(200);
    expect(updates).toHaveLength(1);
    expect(updates[0]!.patch).toMatchObject({ approval_status: "pending", store_name: "Mandoo Cafe", store_category_id: "cat-1" });
    expect(updates[0]!.filters).toContainEqual(["approval_status", "revision_requested"]);
    expect(appendEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "resubmit", toStatus: "pending" }));
    expect(notifyAdmins).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ kind: "resubmit" }));
  });

  it("보완 요청 상태가 아니면 409, 저장 없음", async () => {
    storeRow = { ...storeRow!, approval_status: "pending" };
    const res = await POST(req(), ctx);
    expect(res.status).toBe(409);
    expect(updates).toHaveLength(0);
  });

  it("남의 매장이면 404", async () => {
    storeRow = { ...storeRow!, owner_user_id: "someone-else" };
    const res = await POST(req(), ctx);
    expect(res.status).toBe(404);
  });

  it("동시에 상태가 바뀌었으면(0행) 409 status_changed", async () => {
    updateResult = null;
    const res = await POST(req(), ctx);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe("status_changed");
  });
});
