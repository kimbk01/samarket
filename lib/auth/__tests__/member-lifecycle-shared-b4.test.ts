import { beforeEach, describe, expect, it, vi } from "vitest";

const redisStore = new Map<string, string>();

vi.mock("@/lib/http/rate-limit-redis", () => ({
  getOptionalRateLimitRedis: () => ({
    get: async (key: string) => redisStore.get(key) ?? null,
    set: async (key: string, value: string) => {
      redisStore.set(key, value);
    },
    del: async (key: string) => {
      redisStore.delete(key);
    },
  }),
}));

describe("B4 / D-3 member lifecycle shared snapshot", () => {
  beforeEach(() => {
    redisStore.clear();
  });

  it("write → read → delete round-trip", async () => {
    const {
      writeMemberLifecycleAuthorityShared,
      readMemberLifecycleAuthorityShared,
      deleteMemberLifecycleAuthorityShared,
      memberLifecycleSharedStorageKey,
    } = await import("@/lib/auth/member-lifecycle-authority-shared");

    await writeMemberLifecycleAuthorityShared(
      "user-b4",
      { status: "active", deleted_at: null },
      3
    );
    const key = memberLifecycleSharedStorageKey("user-b4");
    expect(redisStore.has(key)).toBe(true);
    const snap = await readMemberLifecycleAuthorityShared("user-b4");
    expect(snap).toEqual({ status: "active", deleted_at: null, epoch: 3 });
    await deleteMemberLifecycleAuthorityShared("user-b4");
    expect(await readMemberLifecycleAuthorityShared("user-b4")).toBeNull();
  });

  it("resolve uses shared Redis and skips profiles", async () => {
    vi.resetModules();
    redisStore.clear();

    const fromSpy = vi.fn(() => {
      throw new Error("profiles must not be queried on shared hit");
    });
    vi.doMock("@/lib/http/rate-limit-redis", () => ({
      getOptionalRateLimitRedis: () => ({
        get: async (key: string) => redisStore.get(key) ?? null,
        set: async (key: string, value: string) => {
          redisStore.set(key, value);
        },
        del: async (key: string) => {
          redisStore.delete(key);
        },
      }),
    }));
    vi.doMock("@/lib/supabase/try-supabase-server", () => ({
      tryCreateSupabaseServiceClient: () => ({ from: fromSpy }),
    }));
    vi.doMock("@/lib/supabase/supabase-server-route", () => ({
      createSupabaseRouteHandlerClient: async () => ({ from: fromSpy }),
    }));

    const { writeMemberLifecycleAuthorityShared } = await import(
      "@/lib/auth/member-lifecycle-authority-shared"
    );
    const { invalidateMemberLifecycleAuthority } = await import(
      "@/lib/auth/member-lifecycle-authority-cache"
    );
    invalidateMemberLifecycleAuthority("user-shared");
    await writeMemberLifecycleAuthorityShared(
      "user-shared",
      { status: "active", deleted_at: null },
      0
    );

    const { resolveMemberLifecycleAuthority } = await import(
      "@/lib/auth/resolve-member-lifecycle-authority"
    );
    const result = await resolveMemberLifecycleAuthority("user-shared");
    expect(result.kind).toBe("RESOLVED");
    if (result.kind === "RESOLVED") {
      expect(result.source).toBe("cache");
      expect(result.profile.status).toBe("active");
    }
    expect(fromSpy).not.toHaveBeenCalled();
  });
});
