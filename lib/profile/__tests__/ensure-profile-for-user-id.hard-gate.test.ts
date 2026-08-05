/**
 * Slice 7-5 — ensureProfileForUserId create-if-missing / noop semantics (Hard Gate impl).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const fetchProfileRowSafe = vi.fn();

vi.mock("@/lib/profile/fetch-profile-row-safe", () => ({
  fetchProfileRowSafe: (...args: unknown[]) => fetchProfileRowSafe(...args),
}));

describe("ensureProfileForUserId Hard Gate impl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("noop: returns existing profile without upsert", async () => {
    const { ensureProfileForUserId } = await import("@/lib/profile/ensure-profile-for-user-id");
    fetchProfileRowSafe.mockResolvedValue({ id: "u1", email: "a@b.c" });
    const upsert = vi.fn();
    const getUserById = vi.fn();
    const sb = {
      from: vi.fn(() => ({ upsert })),
      auth: { admin: { getUserById } },
    } as unknown as SupabaseClient;

    const row = await ensureProfileForUserId(sb, "u1");
    expect(row?.id).toBe("u1");
    expect(upsert).not.toHaveBeenCalled();
    expect(getUserById).not.toHaveBeenCalled();
  });

  it("create-if-missing: upserts when profile absent and auth user exists", async () => {
    const { ensureProfileForUserId } = await import("@/lib/profile/ensure-profile-for-user-id");
    fetchProfileRowSafe
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "u2", email: "g@example.com" });
    const upsert = vi.fn(async () => ({ error: null }));
    const getUserById = vi.fn(async () => ({
      data: {
        user: {
          id: "u2",
          email: "g@example.com",
          user_metadata: { provider: "google" },
          app_metadata: { provider: "google" },
        },
      },
      error: null,
    }));
    const sb = {
      from: vi.fn(() => ({ upsert })),
      auth: { admin: { getUserById } },
    } as unknown as SupabaseClient;

    const row = await ensureProfileForUserId(sb, "u2");
    expect(getUserById).toHaveBeenCalledWith("u2");
    expect(upsert).toHaveBeenCalled();
    expect(row?.id).toBe("u2");
  });

  it("final null when auth user missing and profile missing", async () => {
    const { ensureProfileForUserId } = await import("@/lib/profile/ensure-profile-for-user-id");
    fetchProfileRowSafe.mockResolvedValue(null);
    const upsert = vi.fn();
    const getUserById = vi.fn(async () => ({ data: { user: null }, error: { message: "missing" } }));
    const sb = {
      from: vi.fn(() => ({ upsert })),
      auth: { admin: { getUserById } },
    } as unknown as SupabaseClient;

    const row = await ensureProfileForUserId(sb, "missing");
    expect(row).toBeNull();
    expect(upsert).not.toHaveBeenCalled();
  });
});
