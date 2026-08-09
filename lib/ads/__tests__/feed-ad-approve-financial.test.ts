/**
 * PHASE 1 financial cases F1–F6 for approveFeedAdRequest.
 * In-memory fake Supabase covering feed_ad_requests / campaigns / creatives / holds.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/points/user-point-ledger", () => ({
  spendUserPoints: vi.fn(async () => ({ ok: true })),
  creditUserPoints: vi.fn(async () => ({ ok: true })),
  appendUserPointLedgerAudit: vi.fn(async () => undefined),
}));

import { creditUserPoints } from "@/lib/points/user-point-ledger";
import { approveFeedAdRequest } from "@/lib/ads/approve-feed-ad-request";

type Row = Record<string, unknown>;

function makeDb() {
  const state = {
    requests: [] as Row[],
    requestCreatives: [] as Row[],
    campaigns: [] as Row[],
    creatives: [] as Row[],
    holds: [] as Row[],
    failCampaignInsert: false,
    failCreativeInsert: false,
    failCapture: false,
    failActivate: false,
    failRequestActivate: false,
  };

  function matchEq(row: Row, filters: { col: string; val: unknown }[]) {
    return filters.every((f) => {
      const v = row[f.col];
      if (f.val === null) return v == null;
      return String(v) === String(f.val);
    });
  }

  function tableApi(table: string) {
    const filters: { col: string; val: unknown }[] = [];
    const inFilters: { col: string; vals: unknown[] }[] = [];
    const nullFilters: string[] = [];
    let payload: Row | Row[] | null = null;
    let mode: "select" | "insert" | "update" | "delete" = "select";
    let orderCol: string | null = null;

    const api: Record<string, unknown> = {
      select(_cols?: string) {
        return api;
      },
      insert(rows: Row | Row[]) {
        mode = "insert";
        payload = rows;
        return api;
      },
      update(row: Row) {
        mode = "update";
        payload = row;
        return api;
      },
      delete() {
        mode = "delete";
        return api;
      },
      eq(col: string, val: unknown) {
        filters.push({ col, val });
        return api;
      },
      in(col: string, vals: unknown[]) {
        inFilters.push({ col, vals });
        return api;
      },
      is(col: string, val: null) {
        if (val === null) nullFilters.push(col);
        return api;
      },
      order(col: string) {
        orderCol = col;
        return api;
      },
      maybeSingle: async () => finish(true),
      then: undefined as unknown,
    };

    async function finish(single: boolean) {
      if (table === "feed_ad_requests") {
        if (mode === "select") {
          let rows = state.requests.filter((r) => matchEq(r, filters));
          for (const nf of nullFilters) {
            rows = rows.filter((r) => r[nf] == null);
          }
          return { data: single ? rows[0] ?? null : rows, error: null };
        }
        if (mode === "update" && payload && !Array.isArray(payload)) {
          const idx = state.requests.findIndex((r) => {
            if (!matchEq(r, filters)) return false;
            for (const nf of nullFilters) {
              if (r[nf] != null) return false;
            }
            return true;
          });
          if (state.failRequestActivate && payload.status === "active") {
            return { data: null, error: { message: "request_activate_failed" } };
          }
          if (idx < 0) return { data: null, error: null };
          state.requests[idx] = { ...state.requests[idx], ...payload };
          return { data: single ? state.requests[idx] : [state.requests[idx]], error: null };
        }
      }

      if (table === "feed_ad_request_creatives") {
        let rows = state.requestCreatives.filter((r) => matchEq(r, filters));
        if (orderCol) {
          rows = [...rows].sort(
            (a, b) => Number(a[orderCol!] ?? 0) - Number(b[orderCol!] ?? 0)
          );
        }
        return { data: rows, error: null };
      }

      if (table === "feed_ad_campaigns") {
        if (mode === "insert") {
          if (state.failCampaignInsert) {
            return { data: null, error: { message: "campaign_create_failed" } };
          }
          const row = Array.isArray(payload) ? payload[0]! : (payload as Row);
          const id = String(row.id ?? `camp-${state.campaigns.length + 1}`);
          const full = { ...row, id };
          state.campaigns.push(full);
          return { data: single ? full : [full], error: null };
        }
        if (mode === "update" && payload && !Array.isArray(payload)) {
          if (state.failActivate && payload.status === "active") {
            return { data: null, error: { message: "campaign_activate_failed" } };
          }
          const idx = state.campaigns.findIndex((r) => matchEq(r, filters));
          if (idx < 0) return { data: null, error: null };
          state.campaigns[idx] = { ...state.campaigns[idx], ...payload };
          return { data: single ? state.campaigns[idx] : [state.campaigns[idx]], error: null };
        }
        if (mode === "delete") {
          state.campaigns = state.campaigns.filter((r) => !matchEq(r, filters));
          return { data: null, error: null };
        }
      }

      if (table === "feed_ad_creatives") {
        if (mode === "insert") {
          if (state.failCreativeInsert) {
            return { data: null, error: { message: "creative_insert_failed" } };
          }
          const rows = Array.isArray(payload) ? payload : [payload as Row];
          for (const r of rows) {
            state.creatives.push({ ...r, id: `cr-${state.creatives.length + 1}` });
          }
          return { data: rows, error: null };
        }
        if (mode === "delete") {
          state.creatives = state.creatives.filter((r) => !matchEq(r, filters));
          return { data: null, error: null };
        }
      }

      if (table === "feed_ad_point_holds") {
        if (mode === "select") {
          let rows = state.holds.filter((r) => matchEq(r, filters));
          for (const inf of inFilters) {
            rows = rows.filter((r) => inf.vals.map(String).includes(String(r[inf.col])));
          }
          return { data: rows, error: null };
        }
        if (mode === "update" && payload && !Array.isArray(payload)) {
          if (state.failCapture && payload.status === "captured") {
            return { data: null, error: { message: "capture_failed" } };
          }
          const idxs = state.holds
            .map((r, i) => ({ r, i }))
            .filter(({ r }) => {
              if (!matchEq(r, filters)) return false;
              for (const inf of inFilters) {
                if (!inf.vals.map(String).includes(String(r[inf.col]))) return false;
              }
              return true;
            });
          if (idxs.length === 0) return { data: null, error: null };
          for (const { i } of idxs) {
            state.holds[i] = { ...state.holds[i], ...payload };
          }
          return { data: state.holds[idxs[0]!.i], error: null };
        }
      }

      return { data: single ? null : [], error: null };
    }

    // thenable for await sb.from().select() without maybeSingle (creatives list)
    (api as { then?: unknown }).then = (
      resolve: (v: unknown) => void,
      reject?: (e: unknown) => void
    ) => {
      finish(false).then(resolve, reject);
    };

    return api;
  }

  const sb = {
    from(table: string) {
      return tableApi(table);
    },
  } as unknown as SupabaseClient;

  return { sb, state };
}

describe("approveFeedAdRequest financial invariants", () => {
  const adminId = "admin-1";
  const requestId = "req-1";
  const userId = "user-1";

  function seedPending(state: ReturnType<typeof makeDb>["state"]) {
    state.requests.push({
      id: requestId,
      user_id: userId,
      product_id: "feed_banner_trade_3",
      domain: "trade",
      placement: "TRADE_HOME",
      target_category_id: null,
      target_topic_slug: null,
      destination_type: "internal_page",
      destination_id: "",
      destination_url: "/",
      duration_days: 3,
      point_cost: 8000,
      status: "pending_review",
      reviewed_by: null,
    });
    state.requestCreatives.push({
      request_id: requestId,
      sort_order: 1,
      image_url: "https://example.com/a.png",
      alt_text: "",
      headline: "hi",
    });
    state.holds.push({
      id: "hold-1",
      request_id: requestId,
      user_id: userId,
      amount: 8000,
      status: "held",
    });
  }

  beforeEach(() => {
    vi.mocked(creditUserPoints).mockClear();
    vi.mocked(creditUserPoints).mockResolvedValue({ ok: true } as never);
  });

  it("F1: campaign prepare fail → no CAPTURE → hold stays held", async () => {
    const { sb, state } = makeDb();
    seedPending(state);
    state.failCampaignInsert = true;
    const res = await approveFeedAdRequest(sb, { requestId, adminUserId: adminId });
    expect(res.ok).toBe(false);
    expect(state.holds[0]?.status).toBe("held");
    expect(state.campaigns.length).toBe(0);
    expect(state.requests[0]?.status).toBe("pending_review");
    expect(state.requests[0]?.reviewed_by).toBeNull();
  });

  it("F2: creative prepare fail → no CAPTURE → campaign removed", async () => {
    const { sb, state } = makeDb();
    seedPending(state);
    state.failCreativeInsert = true;
    const res = await approveFeedAdRequest(sb, { requestId, adminUserId: adminId });
    expect(res.ok).toBe(false);
    expect(state.holds[0]?.status).toBe("held");
    expect(state.campaigns.length).toBe(0);
    expect(state.creatives.length).toBe(0);
  });

  it("F3: CAPTURE fail → ad not active", async () => {
    const { sb, state } = makeDb();
    seedPending(state);
    state.failCapture = true;
    const res = await approveFeedAdRequest(sb, { requestId, adminUserId: adminId });
    expect(res.ok).toBe(false);
    expect(state.holds[0]?.status).toBe("held");
    expect(state.campaigns.every((c) => c.status !== "active")).toBe(true);
    expect(state.requests[0]?.status).toBe("pending_review");
  });

  it("F4: activation fail after CAPTURE → compensate credit · no eligible ad", async () => {
    const { sb, state } = makeDb();
    seedPending(state);
    state.failActivate = true;
    const res = await approveFeedAdRequest(sb, { requestId, adminUserId: adminId });
    expect(res.ok).toBe(false);
    expect(creditUserPoints).toHaveBeenCalled();
    expect(state.holds[0]?.status).toBe("released");
    expect(state.campaigns.length).toBe(0);
    expect(state.requests[0]?.status).toBe("pending_review");
  });

  it("F5: success → campaign active + creative + captured + request active", async () => {
    const { sb, state } = makeDb();
    seedPending(state);
    const res = await approveFeedAdRequest(sb, { requestId, adminUserId: adminId });
    expect(res).toMatchObject({ ok: true, status: "active" });
    expect(state.holds[0]?.status).toBe("captured");
    expect(state.campaigns).toHaveLength(1);
    expect(state.campaigns[0]?.status).toBe("active");
    expect(state.creatives.length).toBeGreaterThan(0);
    expect(state.requests[0]?.status).toBe("active");
    expect(state.requests[0]?.campaign_id).toBe(state.campaigns[0]?.id);
  });

  it("invalid localhost creative → no claim · no CAPTURE · no active campaign", async () => {
    const { sb, state } = makeDb();
    seedPending(state);
    state.requestCreatives[0]!.image_url = "http://127.0.0.1:3010/images/feed-ad-samples/x.svg";
    const res = await approveFeedAdRequest(sb, { requestId, adminUserId: adminId });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toMatch(/creative_url/);
    }
    expect(state.holds[0]?.status).toBe("held");
    expect(state.campaigns.length).toBe(0);
    expect(state.requests[0]?.status).toBe("pending_review");
    expect(state.requests[0]?.reviewed_by).toBeNull();
  });

  it("F6: double approve → second not_pending · single campaign", async () => {
    const { sb, state } = makeDb();
    seedPending(state);
    const first = await approveFeedAdRequest(sb, { requestId, adminUserId: adminId });
    expect(first.ok).toBe(true);
    const second = await approveFeedAdRequest(sb, { requestId, adminUserId: "admin-2" });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toBe("not_pending");
    expect(state.campaigns.filter((c) => c.status === "active")).toHaveLength(1);
    expect(state.holds.filter((h) => h.status === "captured")).toHaveLength(1);
  });
});
