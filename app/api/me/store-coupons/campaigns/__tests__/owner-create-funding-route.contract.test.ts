import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const getRouteUserId = vi.fn();
const tryGetSupabaseForStores = vi.fn();

vi.mock("@/lib/auth/get-route-user-id", () => ({
  getRouteUserId: () => getRouteUserId(),
}));

vi.mock("@/lib/stores/try-supabase-stores", () => ({
  tryGetSupabaseForStores: () => tryGetSupabaseForStores(),
}));

const OWNER = "owner-1";
const STORE = "store-1";
const BASE = {
  storeId: STORE,
  title: "UI0 route",
  discountType: "fixed_amount" as const,
  discountValue: 100,
  startAt: "2026-08-25T00:00:00.000Z",
  endAt: "2026-09-25T00:00:00.000Z",
  isActive: true,
};

function makeSb(inserts: unknown[]) {
  return {
    from(table: string) {
      if (table === "stores") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: STORE, owner_user_id: OWNER },
                error: null,
              }),
            }),
          }),
        };
      }
      return {
        insert(payload: unknown) {
          inserts.push(payload);
          return {
            select: () => ({
              single: async () => ({
                data: { id: "camp-1", lifecycle_state: "active", funding_mode: (payload as { funding_mode?: string }).funding_mode },
                error: null,
              }),
            }),
          };
        },
      };
    },
  };
}

async function post(body: Record<string, unknown>) {
  const { POST } = await import("@/app/api/me/store-coupons/campaigns/route");
  const req = new NextRequest("https://samarket.vercel.app/api/me/store-coupons/campaigns", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const res = await POST(req);
  return { status: res.status, json: await res.json() };
}

describe("POST /api/me/store-coupons/campaigns UI-0 route contract", () => {
  beforeEach(() => {
    vi.resetModules();
    getRouteUserId.mockReset();
    tryGetSupabaseForStores.mockReset();
    getRouteUserId.mockResolvedValue(OWNER);
  });

  it("CASE 1 omit funding → STORE_FUNDED insert, approval false, share null", async () => {
    const inserts: unknown[] = [];
    tryGetSupabaseForStores.mockReturnValue(makeSb(inserts));
    const { status, json } = await post({ ...BASE });
    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    expect(inserts).toHaveLength(1);
    const row = inserts[0] as Record<string, unknown>;
    expect(row.funding_mode).toBe("STORE_FUNDED");
    expect(row.requires_admin_approval).toBe(false);
    expect(row.store_funded_amount).toBeNull();
  });

  it("CASE 2 fundingMode STORE_FUNDED → same write", async () => {
    const inserts: unknown[] = [];
    tryGetSupabaseForStores.mockReturnValue(makeSb(inserts));
    const { status } = await post({ ...BASE, fundingMode: "STORE_FUNDED", storeFundedAmount: 70 });
    expect(status).toBe(200);
    const row = inserts[0] as Record<string, unknown>;
    expect(row.funding_mode).toBe("STORE_FUNDED");
    expect(row.requires_admin_approval).toBe(false);
    expect(row.store_funded_amount).toBeNull();
  });

  it("CASE 3 PLATFORM_FUNDED → 400 owner_funding_forbidden INSERT NONE", async () => {
    const inserts: unknown[] = [];
    tryGetSupabaseForStores.mockReturnValue(makeSb(inserts));
    const { status, json } = await post({ ...BASE, fundingMode: "PLATFORM_FUNDED" });
    expect(status).toBe(400);
    expect(json.error).toBe("owner_funding_forbidden");
    expect(inserts).toHaveLength(0);
  });

  it("CASE 4 SHARED_FUNDED → 400 INSERT NONE", async () => {
    const inserts: unknown[] = [];
    tryGetSupabaseForStores.mockReturnValue(makeSb(inserts));
    const { status, json } = await post({ ...BASE, fundingMode: "SHARED_FUNDED" });
    expect(status).toBe(400);
    expect(json.error).toBe("owner_funding_forbidden");
    expect(inserts).toHaveLength(0);
  });

  it("CASE 5 TAMPERED → 400 INSERT NONE", async () => {
    const inserts: unknown[] = [];
    tryGetSupabaseForStores.mockReturnValue(makeSb(inserts));
    const { status, json } = await post({ ...BASE, fundingMode: "TAMPERED_VALUE" });
    expect(status).toBe(400);
    expect(json.error).toBe("owner_funding_forbidden");
    expect(inserts).toHaveLength(0);
  });
});

describe("Owner route bypass + Admin create source lock", () => {
  it("Owner POST insert uses resolver write only — no body fundingMode re-insert", () => {
    const src = readFileSync(
      resolve(process.cwd(), "app/api/me/store-coupons/campaigns/route.ts"),
      "utf8"
    );
    const post = src.slice(src.indexOf("export async function POST"), src.indexOf("export async function PATCH"));
    expect(post).toContain("resolveOwnerSelfIssuedCreateFunding(body)");
    expect(post).toContain("funding_mode: funding.write.funding_mode");
    expect(post).toContain("store_funded_amount: funding.write.store_funded_amount");
    expect(post).not.toMatch(/funding_mode:\s*fundingMode/);
    expect(post).not.toMatch(/funding_mode:\s*String\(body/);
  });

  it("Admin createStoreCouponCampaignAdmin insert uses Admin funding resolver, not Owner STORE lock", () => {
    const src = readFileSync(
      resolve(process.cwd(), "lib/stores/store-coupon-campaign-writer.ts"),
      "utf8"
    );
    expect(src).toContain("resolveAdminSupportedCreateFunding");
    expect(src).not.toContain("resolveOwnerSelfIssuedCreateFunding");
    const fn = src.slice(src.indexOf("function buildInsert"), src.indexOf("function buildUpdate"));
    expect(fn).toContain("funding_mode: funding.funding_mode");
    expect(fn).toContain("store_funded_amount: funding.store_funded_amount");
    expect(fn).not.toMatch(/funding_mode:\s*"STORE_FUNDED"/);
  });
});
