import { beforeEach, describe, expect, it, vi } from "vitest";

describe("publishVideoUpgradeRequest", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns false when supabase client is unavailable", async () => {
    vi.doMock("@/lib/supabase/client", () => ({
      getSupabaseClient: () => null,
    }));
    const { publishVideoUpgradeRequest } = await import(
      "@/lib/community-messenger/call-video-upgrade-broadcast"
    );
    const ok = await publishVideoUpgradeRequest("peer-1", {
      sessionId: "sess-1",
      fromUserId: "me-1",
    });
    expect(ok).toBe(false);
  });
});
