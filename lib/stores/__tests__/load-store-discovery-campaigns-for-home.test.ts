import { describe, expect, it, vi } from "vitest";
import { loadActiveStoreDiscoveryCampaignsForHome } from "@/lib/stores/load-store-discovery-campaigns-for-home";

describe("loadActiveStoreDiscoveryCampaignsForHome — P1-D B2", () => {
  it("T8 query error => status=error and empty map (HOME degrade)", async () => {
    const sb = {
      from: () => ({
        select: () => ({
          in: () => ({
            eq: () => ({
              lte: () => ({
                gt: async () => ({ data: null, error: { message: "boom" } }),
              }),
            }),
          }),
        }),
      }),
    } as never;

    const result = await loadActiveStoreDiscoveryCampaignsForHome(sb, ["s1", "s2"]);
    expect(result.status).toBe("error");
    expect(result.byStoreId.size).toBe(0);
  });

  it("empty candidate ids => ok empty without query", async () => {
    const from = vi.fn();
    const sb = { from } as never;
    const result = await loadActiveStoreDiscoveryCampaignsForHome(sb, []);
    expect(result.status).toBe("ok");
    expect(result.byStoreId.size).toBe(0);
    expect(from).not.toHaveBeenCalled();
  });

  it("T1 parses active rows scoped to candidates", async () => {
    const sb = {
      from: () => ({
        select: () => ({
          in: () => ({
            eq: () => ({
              lte: () => ({
                gt: async () => ({
                  data: [
                    {
                      id: "c1",
                      store_id: "s1",
                      campaign_type: "event",
                      title: "이벤트",
                      body_copy: null,
                      start_at: "2026-08-20T00:00:00.000Z",
                      end_at: "2026-08-30T00:00:00.000Z",
                      is_active: true,
                    },
                    {
                      id: "c2",
                      store_id: "s-out",
                      campaign_type: "promo",
                      title: "외부",
                      body_copy: null,
                      start_at: "2026-08-20T00:00:00.000Z",
                      end_at: "2026-08-30T00:00:00.000Z",
                      is_active: true,
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }),
    } as never;

    const result = await loadActiveStoreDiscoveryCampaignsForHome(sb, ["s1"], {
      nowMs: Date.parse("2026-08-23T12:00:00.000Z"),
    });
    expect(result.status).toBe("ok");
    expect([...result.byStoreId.keys()]).toEqual(["s1"]);
    expect(result.byStoreId.get("s1")?.title).toBe("이벤트");
  });
});
