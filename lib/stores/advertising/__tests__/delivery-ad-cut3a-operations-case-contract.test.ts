/**
 * PRODUCT CUT 3-A — Operations Case/Thread binding contracts.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  campaignIdFromCaseRow,
  campaignIdentityToCaseFkColumns,
  DELIVERY_AD_OPERATIONS_CASE_STATUSES,
  DELIVERY_AD_OPERATIONS_CASE_TABLE,
  DELIVERY_AD_OPERATIONS_THREAD_TABLE,
  parseDeliveryAdCampaignIdentity,
} from "@/lib/stores/advertising/delivery-ad-operations-case";
import {
  ensureDeliveryAdOperationsCase,
  updateDeliveryAdOperationsCaseStatus,
} from "@/lib/stores/advertising/delivery-ad-operations-case-service";
import {
  BANNER_AD_CAMPAIGN_TABLE,
  STORE_SPONSORED_CAMPAIGN_TABLE,
} from "@/lib/stores/advertising/delivery-ad-domain";

const MIG = join(
  process.cwd(),
  "supabase/migrations/20261201200000_delivery_ads_cut3a_operations_case.sql"
);

function migSrc(): string {
  expect(existsSync(MIG)).toBe(true);
  return readFileSync(MIG, "utf8");
}

describe("CUT 3-A identity helpers", () => {
  it("maps store_sponsored and banner to dual FK columns", () => {
    const sponsored = parseDeliveryAdCampaignIdentity({
      productKind: "store_sponsored",
      campaignId: "camp-s-1",
    });
    expect(sponsored).toEqual({ productKind: "store_sponsored", campaignId: "camp-s-1" });
    expect(campaignIdentityToCaseFkColumns(sponsored!)).toEqual({
      product_kind: "store_sponsored",
      store_sponsored_campaign_id: "camp-s-1",
      banner_campaign_id: null,
    });

    const banner = parseDeliveryAdCampaignIdentity({
      productKind: "banner",
      campaignId: "camp-b-1",
    });
    expect(campaignIdentityToCaseFkColumns(banner!)).toEqual({
      product_kind: "banner",
      store_sponsored_campaign_id: null,
      banner_campaign_id: "camp-b-1",
    });
  });

  it("rejects invalid productKind / empty campaignId", () => {
    expect(
      parseDeliveryAdCampaignIdentity({ productKind: "coupon", campaignId: "x" })
    ).toBeNull();
    expect(
      parseDeliveryAdCampaignIdentity({ productKind: "store_sponsored", campaignId: "  " })
    ).toBeNull();
  });

  it("does not treat raw UUID alone as universal identity", () => {
    const a = campaignIdentityToCaseFkColumns({
      productKind: "store_sponsored",
      campaignId: "same-uuid",
    });
    const b = campaignIdentityToCaseFkColumns({
      productKind: "banner",
      campaignId: "same-uuid",
    });
    expect(a.store_sponsored_campaign_id).toBe("same-uuid");
    expect(a.banner_campaign_id).toBeNull();
    expect(b.banner_campaign_id).toBe("same-uuid");
    expect(b.store_sponsored_campaign_id).toBeNull();
    expect(a.product_kind).not.toBe(b.product_kind);
  });

  it("case status vocabulary excludes campaign lifecycle values", () => {
    expect(DELIVERY_AD_OPERATIONS_CASE_STATUSES).toEqual([
      "OPEN",
      "WAITING_OWNER",
      "WAITING_ADMIN",
      "RESOLVED",
    ]);
    for (const forbidden of [
      "APPROVED",
      "ACTIVE",
      "PAUSED_ADMIN",
      "REJECTED",
      "SUBMITTED",
    ]) {
      expect(DELIVERY_AD_OPERATIONS_CASE_STATUSES as readonly string[]).not.toContain(
        forbidden
      );
    }
  });

  it("campaignIdFromCaseRow respects product kind", () => {
    expect(
      campaignIdFromCaseRow({
        productKind: "store_sponsored",
        storeSponsoredCampaignId: "s1",
        bannerCampaignId: null,
      })
    ).toBe("s1");
    expect(
      campaignIdFromCaseRow({
        productKind: "banner",
        storeSponsoredCampaignId: null,
        bannerCampaignId: "b1",
      })
    ).toBe("b1");
  });
});

describe("CUT 3-A migration contract", () => {
  it("creates dual FK case + unique thread with exactly-one CHECK", () => {
    const sql = migSrc();
    expect(sql).toContain(DELIVERY_AD_OPERATIONS_CASE_TABLE);
    expect(sql).toContain(DELIVERY_AD_OPERATIONS_THREAD_TABLE);
    expect(sql).toContain(`REFERENCES public.${STORE_SPONSORED_CAMPAIGN_TABLE}`);
    expect(sql).toContain(`REFERENCES public.${BANNER_AD_CAMPAIGN_TABLE}`);
    expect(sql).toContain("delivery_ad_operations_cases_exactly_one_campaign");
    expect(sql).toContain("delivery_ad_ops_cases_sponsored_campaign_uidx");
    expect(sql).toContain("delivery_ad_ops_cases_banner_campaign_uidx");
    expect(sql).toMatch(/case_id uuid NOT NULL UNIQUE/);
    expect(sql).not.toMatch(/CREATE TABLE[\s\S]*delivery_ad_operations_messages/);
    expect(sql).not.toMatch(/notification_events|admin_delivery_ad_transition|review_notes/);
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("is_platform_admin");
    expect(sql).toContain("owner_user_id = auth.uid()");
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.delivery_ad_operations_cases FROM anon, authenticated/);
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.delivery_ad_operations_threads FROM anon, authenticated/);
    expect(sql).toMatch(/GRANT SELECT ON TABLE public\.delivery_ad_operations_cases TO authenticated/);
    expect(sql).not.toMatch(/FOR INSERT|FOR UPDATE|FOR DELETE/);
  });

  it("does not create unified campaign parent or Care/messenger tables", () => {
    const sql = migSrc();
    expect(sql).not.toMatch(/member_admin_note_|platform_admin_inquiries|community_messenger/);
    expect(sql).not.toMatch(/CREATE TABLE.*delivery_ad_campaigns[^_]/);
  });
});

type MockState = {
  cases: Record<string, unknown>[];
  threads: Record<string, unknown>[];
  campaigns: Record<string, { id: string; owner_user_id: string | null }>;
};

function makeMockSb(state: MockState) {
  const from = (table: string) => {
    let filters: Record<string, string> = {};
    let insertRow: Record<string, unknown> | null = null;
    let updatePatch: Record<string, unknown> | null = null;
    let op: "select" | "insert" | "update" = "select";

    const run = async () => {
      if (table === STORE_SPONSORED_CAMPAIGN_TABLE || table === BANNER_AD_CAMPAIGN_TABLE) {
        const id = filters.id;
        const row = state.campaigns[`${table}:${id}`];
        return { data: row ?? null, error: null };
      }
      if (table === DELIVERY_AD_OPERATIONS_CASE_TABLE) {
        if (op === "insert" && insertRow) {
          const sponsored = insertRow.store_sponsored_campaign_id as string | null;
          const banner = insertRow.banner_campaign_id as string | null;
          const dup = state.cases.find(
            (c) =>
              (sponsored && c.store_sponsored_campaign_id === sponsored) ||
              (banner && c.banner_campaign_id === banner)
          );
          if (dup) {
            return { data: null, error: { code: "23505", message: "duplicate key" } };
          }
          const row = { ...insertRow, id: insertRow.id ?? `case_${state.cases.length + 1}` };
          state.cases.push(row);
          return { data: row, error: null };
        }
        if (op === "update" && updatePatch) {
          const id = filters.id;
          const idx = state.cases.findIndex((c) => c.id === id);
          if (idx < 0) return { data: null, error: null };
          state.cases[idx] = { ...state.cases[idx], ...updatePatch };
          return { data: state.cases[idx], error: null };
        }
        const row = state.cases.find((c) => {
          if (filters.store_sponsored_campaign_id) {
            return c.store_sponsored_campaign_id === filters.store_sponsored_campaign_id;
          }
          if (filters.banner_campaign_id) {
            return c.banner_campaign_id === filters.banner_campaign_id;
          }
          if (filters.id) return c.id === filters.id;
          return false;
        });
        return { data: row ?? null, error: null };
      }
      if (table === DELIVERY_AD_OPERATIONS_THREAD_TABLE) {
        if (op === "insert" && insertRow) {
          const caseId = insertRow.case_id as string;
          const dup = state.threads.find((t) => t.case_id === caseId);
          if (dup) {
            return { data: null, error: { code: "23505", message: "duplicate key" } };
          }
          const row = { ...insertRow, id: `thread_${state.threads.length + 1}` };
          state.threads.push(row);
          return { data: row, error: null };
        }
        const row = state.threads.find((t) => t.case_id === filters.case_id);
        return { data: row ?? null, error: null };
      }
      return { data: null, error: { message: "unknown_table" } };
    };

    const api = {
      select: (_cols?: string) => {
        // Keep insert/update op when chained as insert().select().maybeSingle()
        return api;
      },
      insert: (row: Record<string, unknown>) => {
        op = "insert";
        insertRow = row;
        filters = {};
        return api;
      },
      update: (patch: Record<string, unknown>) => {
        op = "update";
        updatePatch = patch;
        filters = {};
        return api;
      },
      eq: (col: string, val: string) => {
        filters[col] = val;
        return api;
      },
      maybeSingle: () => run(),
    };
    return api;
  };
  return { from } as never;
}

describe("CUT 3-A ensureDeliveryAdOperationsCase", () => {
  it("creates OPEN case + one thread for sponsored; idempotent on retry", async () => {
    const state: MockState = {
      cases: [],
      threads: [],
      campaigns: {
        [`${STORE_SPONSORED_CAMPAIGN_TABLE}:s1`]: {
          id: "s1",
          owner_user_id: "owner-1",
        },
      },
    };
    const sb = makeMockSb(state);
    const first = await ensureDeliveryAdOperationsCase(sb, {
      productKind: "store_sponsored",
      campaignId: "s1",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.case.status).toBe("OPEN");
    expect(first.case.storeSponsoredCampaignId).toBe("s1");
    expect(first.case.bannerCampaignId).toBeNull();
    expect(first.case.ownerUserId).toBe("owner-1");
    expect(first.case.threadId).toBeTruthy();

    const second = await ensureDeliveryAdOperationsCase(sb, {
      productKind: "store_sponsored",
      campaignId: "s1",
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.case.id).toBe(first.case.id);
    expect(second.case.threadId).toBe(first.case.threadId);
    expect(state.cases).toHaveLength(1);
    expect(state.threads).toHaveLength(1);
  });

  it("creates separate case for banner with same raw uuid namespace independence", async () => {
    const state: MockState = {
      cases: [],
      threads: [],
      campaigns: {
        [`${BANNER_AD_CAMPAIGN_TABLE}:same-uuid`]: {
          id: "same-uuid",
          owner_user_id: "owner-b",
        },
        [`${STORE_SPONSORED_CAMPAIGN_TABLE}:same-uuid`]: {
          id: "same-uuid",
          owner_user_id: "owner-s",
        },
      },
    };
    const sb = makeMockSb(state);
    const sponsored = await ensureDeliveryAdOperationsCase(sb, {
      productKind: "store_sponsored",
      campaignId: "same-uuid",
    });
    const banner = await ensureDeliveryAdOperationsCase(sb, {
      productKind: "banner",
      campaignId: "same-uuid",
    });
    expect(sponsored.ok && banner.ok).toBe(true);
    if (!sponsored.ok || !banner.ok) return;
    expect(sponsored.case.id).not.toBe(banner.case.id);
    expect(sponsored.case.ownerUserId).toBe("owner-s");
    expect(banner.case.ownerUserId).toBe("owner-b");
    expect(state.cases).toHaveLength(2);
    expect(state.threads).toHaveLength(2);
  });

  it("unique conflict on concurrent insert re-reads canonical case", async () => {
    const existingCase = {
      id: "case_race",
      product_kind: "store_sponsored",
      store_sponsored_campaign_id: "race",
      banner_campaign_id: null,
      owner_user_id: "owner-1",
      status: "OPEN",
      created_at: "t0",
      updated_at: "t0",
      resolved_at: null,
    };
    const state: MockState = {
      cases: [],
      threads: [{ id: "th_race", case_id: "case_race" }],
      campaigns: {
        [`${STORE_SPONSORED_CAMPAIGN_TABLE}:race`]: {
          id: "race",
          owner_user_id: "owner-1",
        },
      },
    };
    let selectCalls = 0;
    const racingSb = {
      from: (table: string) => {
        if (table === STORE_SPONSORED_CAMPAIGN_TABLE) {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: state.campaigns[`${STORE_SPONSORED_CAMPAIGN_TABLE}:race`],
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === DELIVERY_AD_OPERATIONS_CASE_TABLE) {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => {
                  selectCalls += 1;
                  // First ensure lookup: empty. After 23505: return winner.
                  if (selectCalls === 1) return { data: null, error: null };
                  return { data: existingCase, error: null };
                },
              }),
            }),
            insert: () => ({
              select: () => ({
                maybeSingle: async () => ({
                  data: null,
                  error: { code: "23505", message: "duplicate key" },
                }),
              }),
            }),
          };
        }
        if (table === DELIVERY_AD_OPERATIONS_THREAD_TABLE) {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: state.threads[0],
                  error: null,
                }),
              }),
            }),
          };
        }
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
      },
    } as never;

    const res = await ensureDeliveryAdOperationsCase(racingSb, {
      productKind: "store_sponsored",
      campaignId: "race",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.case.id).toBe("case_race");
    expect(res.case.threadId).toBe("th_race");
    expect(selectCalls).toBeGreaterThanOrEqual(2);
  });

  it("fails closed when campaign owner_user_id missing", async () => {
    const state: MockState = {
      cases: [],
      threads: [],
      campaigns: {
        [`${STORE_SPONSORED_CAMPAIGN_TABLE}:no-owner`]: {
          id: "no-owner",
          owner_user_id: null,
        },
      },
    };
    const res = await ensureDeliveryAdOperationsCase(makeMockSb(state), {
      productKind: "store_sponsored",
      campaignId: "no-owner",
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe("owner_missing");
  });
});

describe("CUT 3-A status writer", () => {
  it("updateDeliveryAdOperationsCaseStatus is the sole status mutator path in service", async () => {
    const state: MockState = {
      cases: [
        {
          id: "c1",
          product_kind: "store_sponsored",
          store_sponsored_campaign_id: "s1",
          banner_campaign_id: null,
          owner_user_id: "o1",
          status: "OPEN",
          created_at: "t0",
          updated_at: "t0",
          resolved_at: null,
        },
      ],
      threads: [{ id: "th1", case_id: "c1" }],
      campaigns: {},
    };
    const res = await updateDeliveryAdOperationsCaseStatus(makeMockSb(state), {
      caseId: "c1",
      status: "WAITING_OWNER",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.case.status).toBe("WAITING_OWNER");
    expect(res.case.resolvedAt).toBeNull();

    const resolved = await updateDeliveryAdOperationsCaseStatus(makeMockSb(state), {
      caseId: "c1",
      status: "RESOLVED",
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.case.status).toBe("RESOLVED");
    expect(resolved.case.resolvedAt).toBeTruthy();
  });

  it("no Owner/Admin UI or routes mutate case status in 3-A", () => {
    const ownerDetail = readFileSync(
      join(process.cwd(), "components/business/owner/ads/OwnerDeliveryAdDetailView.tsx"),
      "utf8"
    );
    const adminDetail = readFileSync(
      join(process.cwd(), "components/admin/stores/AdminDeliveryAdDetailWorkspace.tsx"),
      "utf8"
    );
    expect(ownerDetail).not.toMatch(/delivery_ad_operations_cases|updateDeliveryAdOperationsCaseStatus/);
    expect(adminDetail).not.toMatch(/delivery_ad_operations_cases|updateDeliveryAdOperationsCaseStatus/);
    expect(existsSync(join(process.cwd(), "app/api/me/delivery-ads/operations"))).toBe(false);
  });
});
