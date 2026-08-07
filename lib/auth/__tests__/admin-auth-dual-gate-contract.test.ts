import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/get-route-user-id", () => ({
  getRouteUserId: vi.fn(),
}));

vi.mock("@/lib/auth/server-guards", () => ({
  validateActiveSession: vi.fn(),
}));

vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: vi.fn(() => null),
}));

vi.mock("@/lib/admin/admin-membership", async () => {
  const actual = await vi.importActual<typeof import("@/lib/admin/admin-membership")>(
    "@/lib/admin/admin-membership"
  );
  return {
    ...actual,
    hasActiveAdminMembershipOrLegacyRole: vi.fn(actual.hasActiveAdminMembershipOrLegacyRole),
  };
});

import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { hasActiveAdminMembershipOrLegacyRole } from "@/lib/admin/admin-membership";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { isPrivilegedAdminRole, normalizeAdminRole } from "@/lib/auth/admin-policy";

const getRouteUserIdMock = vi.mocked(getRouteUserId);
const validateActiveSessionMock = vi.mocked(validateActiveSession);
const tryCreateSbMock = vi.mocked(tryCreateSupabaseServiceClient);
const membershipOrLegacyMock = vi.mocked(hasActiveAdminMembershipOrLegacyRole);

describe("admin-policy role normalization", () => {
  it("maps master → super_admin and treats both as privileged", () => {
    expect(normalizeAdminRole("master")).toBe("super_admin");
    expect(normalizeAdminRole("super_admin")).toBe("super_admin");
    expect(isPrivilegedAdminRole("master")).toBe(true);
    expect(isPrivilegedAdminRole("super_admin")).toBe(true);
    expect(isPrivilegedAdminRole("admin")).toBe(true);
    expect(isPrivilegedAdminRole("operator")).toBe(false);
    expect(isPrivilegedAdminRole(null)).toBe(false);
  });
});

describe("isRouteAdmin ↔ requireAdmin membership-only", () => {
  beforeEach(() => {
    getRouteUserIdMock.mockReset();
    validateActiveSessionMock.mockReset();
    tryCreateSbMock.mockReset();
    tryCreateSbMock.mockReturnValue(null);
    membershipOrLegacyMock.mockClear();
  });

  it("source: isRouteAdmin uses membership helper — no secondary stores client", () => {
    const src = readFileSync(resolve(process.cwd(), "lib/auth/is-route-admin.ts"), "utf8");
    expect(src).not.toMatch(/from ["']@\/lib\/stores\/try-supabase-stores["']/);
    expect(src).not.toMatch(/from ["']@\/lib\/chat\/supabase-server["']/);
    expect(src).toMatch(/validateActiveSession/);
    expect(src).toMatch(/hasActiveAdminMembershipOrLegacyRole/);
    expect(src).not.toMatch(/isPrivilegedAdminRole/);
  });

  it("source: requireAdminApiUser chains requireAuth → validateActiveSession → requireAdmin", () => {
    const src = readFileSync(resolve(process.cwd(), "lib/admin/require-admin-api.ts"), "utf8");
    expect(src).toMatch(/requireAuth/);
    expect(src).toMatch(/validateActiveSession/);
    expect(src).toMatch(/requireAdmin/);
  });

  it("source: requireAdmin uses membership-only helper", () => {
    const src = readFileSync(resolve(process.cwd(), "lib/auth/server-guards.ts"), "utf8");
    const idx = src.indexOf("export async function requireAdmin");
    expect(idx).toBeGreaterThan(-1);
    const snippet = src.slice(idx, idx + 800);
    expect(snippet).toMatch(/getCurrentProfile/);
    expect(snippet).toMatch(/hasActiveAdminMembershipOrLegacyRole/);
    expect(snippet).not.toMatch(/isPrivilegedAdminRole\(profile\.role\)/);
  });

  it("unauthenticated → false", async () => {
    getRouteUserIdMock.mockResolvedValue(null);
    await expect(isRouteAdmin()).resolves.toBe(false);
    expect(validateActiveSessionMock).not.toHaveBeenCalled();
  });

  it("non-admin role + no membership path → false", async () => {
    getRouteUserIdMock.mockResolvedValue("user-1");
    validateActiveSessionMock.mockResolvedValue({
      ok: true,
      profile: { id: "user-1", role: "user" } as never,
    });
    tryCreateSbMock.mockReturnValue(null);
    await expect(isRouteAdmin()).resolves.toBe(false);
  });

  it("membership-only admin → true", async () => {
    getRouteUserIdMock.mockResolvedValue("user-2");
    validateActiveSessionMock.mockResolvedValue({
      ok: true,
      profile: { id: "user-2", role: "user" } as never,
    });
    tryCreateSbMock.mockReturnValue({} as never);
    membershipOrLegacyMock.mockResolvedValue(true);
    await expect(isRouteAdmin()).resolves.toBe(true);
    expect(membershipOrLegacyMock).toHaveBeenCalled();
  });

  it("legacy privileged profile alone → false without membership", async () => {
    getRouteUserIdMock.mockResolvedValue("admin-1");
    validateActiveSessionMock.mockResolvedValue({
      ok: true,
      profile: { id: "admin-1", role: "super_admin" } as never,
    });
    tryCreateSbMock.mockReturnValue({} as never);
    membershipOrLegacyMock.mockResolvedValue(false);
    await expect(isRouteAdmin()).resolves.toBe(false);

    validateActiveSessionMock.mockResolvedValue({
      ok: true,
      profile: { id: "admin-1", role: "master" } as never,
    });
    membershipOrLegacyMock.mockResolvedValue(false);
    await expect(isRouteAdmin()).resolves.toBe(false);
  });

  it("invalid session → false", async () => {
    getRouteUserIdMock.mockResolvedValue("admin-1");
    validateActiveSessionMock.mockResolvedValue({
      ok: false,
      response: new Response() as never,
    });
    await expect(isRouteAdmin()).resolves.toBe(false);
  });
});
