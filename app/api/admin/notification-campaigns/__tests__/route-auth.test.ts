import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const requireAdminApiUser = vi.fn();
const tryCreateSupabaseServiceClient = vi.fn();
const runNotificationCampaignSendBatch = vi.fn();

vi.mock("@/lib/admin/require-admin-api", () => ({
  requireAdminApiUser: () => requireAdminApiUser(),
}));

vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: () => tryCreateSupabaseServiceClient(),
}));

vi.mock("@/lib/admin/notification-campaigns/run-campaign-send-batch", () => ({
  runNotificationCampaignSendBatch: (...args: unknown[]) => runNotificationCampaignSendBatch(...args),
}));

describe("admin notification campaign routes auth", () => {
  beforeEach(() => {
    vi.resetModules();
    requireAdminApiUser.mockReset();
    tryCreateSupabaseServiceClient.mockReset();
    runNotificationCampaignSendBatch.mockReset();
  });

  it("returns 403 on detail route when non-admin", async () => {
    requireAdminApiUser.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }),
    });
    const { GET } = await import("@/app/api/admin/notification-campaigns/[campaignId]/route");
    const res = await GET({} as never, { params: Promise.resolve({ campaignId: "c1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 403 on list/create route when non-admin", async () => {
    requireAdminApiUser.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }),
    });
    const route = await import("@/app/api/admin/notification-campaigns/route");
    const getRes = await route.GET(
      { url: "https://samarket.vercel.app/api/admin/notification-campaigns" } as never
    );
    const postRes = await route.POST(
      new Request("https://samarket.vercel.app/api/admin/notification-campaigns", {
        method: "POST",
        body: JSON.stringify({}),
      }) as never
    );
    expect(getRes.status).toBe(403);
    expect(postRes.status).toBe(403);
  });

  it("returns 403 on send route when non-admin", async () => {
    requireAdminApiUser.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }),
    });
    const { POST } = await import("@/app/api/admin/notification-campaigns/[campaignId]/send/route");
    const res = await POST({} as never, { params: Promise.resolve({ campaignId: "c1" }) });
    expect(res.status).toBe(403);
  });

  it("scopes campaignId lookup exactly", async () => {
    requireAdminApiUser.mockResolvedValue({ ok: true, userId: "admin-1" });
    const eqSpy = vi.fn(() => ({ maybeSingle: async () => ({ data: null, error: null }) }));
    const svc = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({ eq: eqSpy })),
      })),
    };
    tryCreateSupabaseServiceClient.mockReturnValue(svc);
    const { GET } = await import("@/app/api/admin/notification-campaigns/[campaignId]/route");
    const res = await GET({} as never, { params: Promise.resolve({ campaignId: "campaign-own-only" }) });
    expect(eqSpy).toHaveBeenCalledWith("id", "campaign-own-only");
    expect([404, 200]).toContain(res.status);
  });
});
