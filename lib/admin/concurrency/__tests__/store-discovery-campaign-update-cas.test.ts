import { describe, expect, it } from "vitest";
import { updateStoreDiscoveryCampaignAdmin } from "@/lib/stores/store-discovery-campaign-writer";
import { createFakeSupabase, filterValue } from "./fake-supabase-query";

const LOADED = "2026-10-19T01:00:00.123+00:00";
const row = {
  id: "c-1",
  store_id: "s-1",
  campaign_type: "event",
  title: "T",
  body_copy: null,
  start_at: "2026-10-20T00:00:00.000Z",
  end_at: "2026-10-30T00:00:00.000Z",
  is_active: true,
  created_by_user_id: null,
  updated_by_user_id: null,
  created_at: LOADED,
  updated_at: LOADED,
};

describe("store discovery campaign update — CAS (no updated_at trigger: writer sets it)", () => {
  it("expected_updated_at_required when omitted", async () => {
    const { sb, calls } = createFakeSupabase(() => ({ data: row, error: null }));
    const r = await updateStoreDiscoveryCampaignAdmin(sb as never, { id: "c-1", title: "N" }, "admin-1");
    expect(r).toEqual({ ok: false, error: "expected_updated_at_required" });
    expect(calls).toHaveLength(0);
  });

  it("stale_updated_at when the campaign changed after load", async () => {
    const { sb, calls } = createFakeSupabase(() => ({
      data: { ...row, updated_at: "2026-10-19T02:00:00+00:00" },
      error: null,
    }));
    const r = await updateStoreDiscoveryCampaignAdmin(
      sb as never,
      { id: "c-1", title: "N", expected_updated_at: LOADED },
      "admin-1"
    );
    expect(r).toEqual({ ok: false, error: "stale_updated_at" });
    expect(calls.some((c) => c.op === "update")).toBe(false);
  });

  it("stale_updated_at when the conditional UPDATE matches 0 rows", async () => {
    const { sb, calls } = createFakeSupabase((c) =>
      c.op === "select" ? { data: row, error: null } : { data: null, error: null }
    );
    const r = await updateStoreDiscoveryCampaignAdmin(
      sb as never,
      { id: "c-1", isActive: false, reason: "x", expected_updated_at: LOADED },
      "admin-1"
    );
    expect(r).toEqual({ ok: false, error: "stale_updated_at" });
    const upd = calls.find((c) => c.op === "update")!;
    expect(filterValue(upd, "eq", "updated_at")).toBe(LOADED);
    expect((upd.values as Record<string, unknown>).updated_at).toEqual(expect.any(String));
    expect(upd.values).not.toHaveProperty("expected_updated_at");
  });

  it("normal save succeeds", async () => {
    const { sb } = createFakeSupabase((c) =>
      c.op === "select" ? { data: row, error: null } : { data: { ...row, title: "N" }, error: null }
    );
    const r = await updateStoreDiscoveryCampaignAdmin(
      sb as never,
      { id: "c-1", title: "N", expected_updated_at: LOADED },
      "admin-1"
    );
    expect(r.ok).toBe(true);
  });
});
