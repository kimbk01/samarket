import { describe, expect, it } from "vitest";
import { endFeedAdCampaign } from "@/lib/ads/end-feed-ad-campaign";

function makeSb(opts: {
  campStatus: string;
  requestStatus?: string;
  updateCampFail?: boolean;
}) {
  const state = {
    campStatus: opts.campStatus,
    requestStatus: opts.requestStatus ?? "active",
    campUpdates: 0,
    reqUpdates: 0,
  };
  const sb = {
    from(table: string) {
      if (table === "feed_ad_campaigns") {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          in() {
            return this;
          },
          async maybeSingle() {
            return {
              data: {
                id: "camp-1",
                status: state.campStatus,
                request_id: "req-1",
                end_at: "2026-08-09T00:00:00.000Z",
              },
              error: null,
            };
          },
          update(payload: { status?: string }) {
            return {
              eq() {
                return {
                  in() {
                    return {
                      select() {
                        return {
                          async maybeSingle() {
                            if (opts.updateCampFail) {
                              return { data: null, error: { message: "fail" } };
                            }
                            state.campUpdates += 1;
                            state.campStatus = String(payload.status ?? state.campStatus);
                            return {
                              data: { id: "camp-1", request_id: "req-1" },
                              error: null,
                            };
                          },
                        };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      }
      if (table === "feed_ad_requests") {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          in() {
            return this;
          },
          update() {
            return {
              eq() {
                return {
                  in() {
                    return {
                      select() {
                        return {
                          async maybeSingle() {
                            state.reqUpdates += 1;
                            state.requestStatus = "ended";
                            return { data: { id: "req-1" }, error: null };
                          },
                        };
                      },
                    };
                  },
                };
              },
            };
          },
          async maybeSingle() {
            return {
              data: { id: "req-1", status: state.requestStatus },
              error: null,
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return { sb, state };
}

describe("endFeedAdCampaign", () => {
  it("ends active campaign and linked request without refund API", async () => {
    const { sb, state } = makeSb({ campStatus: "active" });
    const res = await endFeedAdCampaign(sb as never, {
      adminUserId: "admin-1",
      campaignId: "camp-1",
      reason: "admin_ended",
    });
    expect(res).toEqual({
      ok: true,
      status: "ended",
      campaignId: "camp-1",
      requestId: "req-1",
    });
    expect(state.campUpdates).toBe(1);
    expect(state.reqUpdates).toBe(1);
    expect(state.campStatus).toBe("ended");
  });

  it("idempotent when already ended still repairs linked request", async () => {
    const { sb, state } = makeSb({ campStatus: "ended", requestStatus: "active" });
    const res = await endFeedAdCampaign(sb as never, {
      adminUserId: "admin-1",
      campaignId: "camp-1",
    });
    expect(res.ok).toBe(true);
    expect(state.campUpdates).toBe(0);
    expect(state.reqUpdates).toBe(1);
    expect(state.requestStatus).toBe("ended");
  });
});
