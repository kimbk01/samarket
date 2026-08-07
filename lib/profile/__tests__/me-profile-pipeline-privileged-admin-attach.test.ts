/**
 * Control-flow contract: privilegedAdmin must attach on BOTH serviceSb and RLS-only success paths.
 * Source-grep alone is insufficient (Production uses serviceSb early-return path).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PROFILE_ROW, type ProfileRow } from "@/lib/profile/types";

const hasActiveAdminMembershipOrLegacyRole = vi.fn();
const fetchProfileRowSafe = vi.fn();
const ensureUserProfile = vi.fn();
const ensureProfileForUserId = vi.fn();
const ensureAutoDibayIdAssigned = vi.fn();
const tryCreateSupabaseServiceClient = vi.fn(() => null);

vi.mock("@/lib/admin/admin-membership", () => ({
  hasActiveAdminMembershipOrLegacyRole: (...args: unknown[]) =>
    hasActiveAdminMembershipOrLegacyRole(...args),
}));

vi.mock("@/lib/profile/fetch-profile-row-safe", () => ({
  fetchProfileRowSafe: (...args: unknown[]) => fetchProfileRowSafe(...args),
}));

vi.mock("@/lib/auth/ensure-user-profile", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/ensure-user-profile")>(
    "@/lib/auth/ensure-user-profile"
  );
  return {
    ...actual,
    ensureUserProfile: (...args: unknown[]) => ensureUserProfile(...args),
  };
});

vi.mock("@/lib/profile/ensure-profile-for-user-id", () => ({
  ensureProfileForUserId: (...args: unknown[]) => ensureProfileForUserId(...args),
}));

vi.mock("@/lib/auth/assign-auto-dibay-id.server", () => ({
  ensureAutoDibayIdAssigned: (...args: unknown[]) => ensureAutoDibayIdAssigned(...args),
}));

vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: () => tryCreateSupabaseServiceClient(),
}));

vi.mock("@/lib/auth/member-access", () => ({
  ensureAuthProfileRow: vi.fn(async () => undefined),
}));

import { runMeProfileReadPipeline } from "@/lib/profile/me-profile-read-pipeline";

function baseRow(partial: Partial<ProfileRow> = {}): ProfileRow {
  return {
    ...DEFAULT_PROFILE_ROW,
    id: "u1",
    email: "u@example.com",
    role: "user",
    is_admin: false,
    dibay_id: "dibay_test",
    ...partial,
  };
}

describe("me-profile-read-pipeline privilegedAdmin attach", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureUserProfile.mockResolvedValue({ duplicateWarning: false });
    ensureProfileForUserId.mockResolvedValue(null);
    ensureAutoDibayIdAssigned.mockResolvedValue(undefined);
    tryCreateSupabaseServiceClient.mockReturnValue(null);
  });

  it("serviceSb PRESENT: attaches privilegedAdmin before return (Production path)", async () => {
    const row = baseRow({ role: "user", is_admin: false });
    fetchProfileRowSafe.mockResolvedValue(row);
    hasActiveAdminMembershipOrLegacyRole.mockResolvedValue(true);

    const serviceSb = { tag: "service" } as never;
    const routeSb = { tag: "route" } as never;
    const out = await runMeProfileReadPipeline({
      authUserId: "u1",
      supabaseUser: null,
      routeSb,
      serviceSb,
    });

    expect(hasActiveAdminMembershipOrLegacyRole).toHaveBeenCalledWith(serviceSb, "u1");
    expect(out?.privilegedAdmin).toBe(true);
    expect(out?.role).toBe("user");
    expect(out?.is_admin).toBe(false);
  });

  it("serviceSb PRESENT: legacy privileged profile still false without membership", async () => {
    const row = baseRow({ role: "admin", is_admin: true });
    fetchProfileRowSafe.mockResolvedValue(row);
    hasActiveAdminMembershipOrLegacyRole.mockResolvedValue(false);

    const out = await runMeProfileReadPipeline({
      authUserId: "u1",
      supabaseUser: null,
      routeSb: {} as never,
      serviceSb: {} as never,
    });

    expect(out?.privilegedAdmin).toBe(false);
    expect(out?.role).toBe("admin");
  });

  it("serviceSb ABSENT: attaches privilegedAdmin via route/write client", async () => {
    const row = baseRow({ role: "user", is_admin: false });
    fetchProfileRowSafe.mockResolvedValue(row);
    hasActiveAdminMembershipOrLegacyRole.mockResolvedValue(true);

    const routeSb = { tag: "route" } as never;
    const out = await runMeProfileReadPipeline({
      authUserId: "u1",
      supabaseUser: null,
      routeSb,
      serviceSb: null,
    });

    expect(hasActiveAdminMembershipOrLegacyRole).toHaveBeenCalledWith(routeSb, "u1");
    expect(out?.privilegedAdmin).toBe(true);
  });

  it("serviceSb ABSENT: member without membership → privilegedAdmin false", async () => {
    fetchProfileRowSafe.mockResolvedValue(baseRow());
    hasActiveAdminMembershipOrLegacyRole.mockResolvedValue(false);

    const out = await runMeProfileReadPipeline({
      authUserId: "u1",
      supabaseUser: null,
      routeSb: {} as never,
      serviceSb: null,
    });

    expect(out?.privilegedAdmin).toBe(false);
  });

  it("null profile does not call membership helper", async () => {
    fetchProfileRowSafe.mockResolvedValue(null);
    ensureProfileForUserId.mockResolvedValue(null);

    const out = await runMeProfileReadPipeline({
      authUserId: "u1",
      supabaseUser: null,
      routeSb: {} as never,
      serviceSb: {} as never,
    });

    expect(out).toBeNull();
    expect(hasActiveAdminMembershipOrLegacyRole).not.toHaveBeenCalled();
  });
});
