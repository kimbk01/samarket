import { beforeEach, describe, expect, it, vi } from "vitest";

const getRouteUserId = vi.fn();
const tryCreateSupabaseServiceClient = vi.fn();

vi.mock("@/lib/auth/get-route-user-id", () => ({
  getRouteUserId: () => getRouteUserId(),
}));

vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: () => tryCreateSupabaseServiceClient(),
}));

describe("GET /api/me/notifications/admin-banner-feed", () => {
  beforeEach(() => {
    vi.resetModules();
    getRouteUserId.mockReset();
    tryCreateSupabaseServiceClient.mockReset();
  });

  it("applies user isolation and unread/read filters", async () => {
    getRouteUserId.mockResolvedValue("user-a");
    const eqSpy = vi.fn(() => q);
    const inSpy = vi.fn(() => q);
    const isSpy = vi.fn(() => q);
    const q = {
      select: () => q,
      eq: eqSpy,
      is: isSpy,
      in: inSpy,
      order: () => q,
      limit: () => q,
      maybeSingle: async () => ({
        data: {
          id: "evt-1",
          category: "admin_notice",
          title: "t",
          body: "b",
          display_payload: { routeUrl: "/community" },
          created_at: "2026-01-01T00:00:00.000Z",
        },
        error: null,
      }),
    };
    tryCreateSupabaseServiceClient.mockReturnValue({ from: () => q });

    const { GET } = await import("@/app/api/me/notifications/admin-banner-feed/route");
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(eqSpy).toHaveBeenCalledWith("user_id", "user-a");
    expect(eqSpy).toHaveBeenCalledWith("unread", true);
    expect(isSpy).toHaveBeenCalledWith("read_at", null);
    expect(inSpy).toHaveBeenCalledWith("category", ["admin_marketing_banner", "admin_notice"]);
    expect(body.ok).toBe(true);
    expect(body.banner?.id).toBe("evt-1");
  });

  it("returns null banner when unread candidate is absent (read/dismissed)", async () => {
    getRouteUserId.mockResolvedValue("user-a");
    const q = {
      select: () => q,
      eq: () => q,
      is: () => q,
      in: () => q,
      order: () => q,
      limit: () => q,
      maybeSingle: async () => ({ data: null, error: null }),
    };
    tryCreateSupabaseServiceClient.mockReturnValue({ from: () => q });

    const { GET } = await import("@/app/api/me/notifications/admin-banner-feed/route");
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.banner).toBeNull();
  });
});
