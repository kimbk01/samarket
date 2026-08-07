import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/get-route-user-id", () => ({
  getRouteUserId: vi.fn(),
}));

vi.mock("@/lib/auth/server-guards", () => ({
  validateActiveSession: vi.fn(),
}));

import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { isPrivilegedAdminRole, normalizeAdminRole } from "@/lib/auth/admin-policy";

const getRouteUserIdMock = vi.mocked(getRouteUserId);
const validateActiveSessionMock = vi.mocked(validateActiveSession);

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

describe("isRouteAdmin ↔ requireAdminApiUser identity authority", () => {
  beforeEach(() => {
    getRouteUserIdMock.mockReset();
    validateActiveSessionMock.mockReset();
  });

  it("source: isRouteAdmin uses session profile role — no secondary stores client", () => {
    const src = readFileSync(resolve(process.cwd(), "lib/auth/is-route-admin.ts"), "utf8");
    expect(src).not.toMatch(/from ["']@\/lib\/stores\/try-supabase-stores["']/);
    expect(src).not.toMatch(/from ["']@\/lib\/chat\/supabase-server["']/);
    expect(src).toMatch(/validateActiveSession/);
    expect(src).toMatch(/isPrivilegedAdminRole/);
    expect(src).toMatch(/session\.profile\.role/);
  });

  it("source: requireAdminApiUser chains requireAuth → validateActiveSession → requireAdmin", () => {
    const src = readFileSync(resolve(process.cwd(), "lib/admin/require-admin-api.ts"), "utf8");
    expect(src).toMatch(/requireAuth/);
    expect(src).toMatch(/validateActiveSession/);
    expect(src).toMatch(/requireAdmin/);
  });

  it("source: requireAdmin uses isPrivilegedAdminRole on getCurrentProfile", () => {
    const src = readFileSync(resolve(process.cwd(), "lib/auth/server-guards.ts"), "utf8");
    const idx = src.indexOf("export async function requireAdmin");
    expect(idx).toBeGreaterThan(-1);
    const snippet = src.slice(idx, idx + 500);
    expect(snippet).toMatch(/getCurrentProfile/);
    expect(snippet).toMatch(/isPrivilegedAdminRole/);
  });

  it("unauthenticated → false", async () => {
    getRouteUserIdMock.mockResolvedValue(null);
    await expect(isRouteAdmin()).resolves.toBe(false);
    expect(validateActiveSessionMock).not.toHaveBeenCalled();
  });

  it("non-admin role → false", async () => {
    getRouteUserIdMock.mockResolvedValue("user-1");
    validateActiveSessionMock.mockResolvedValue({
      ok: true,
      profile: { id: "user-1", role: "user" } as never,
    });
    await expect(isRouteAdmin()).resolves.toBe(false);
  });

  it("super_admin / master mapping → true (deterministic)", async () => {
    getRouteUserIdMock.mockResolvedValue("admin-1");
    validateActiveSessionMock.mockResolvedValue({
      ok: true,
      profile: { id: "admin-1", role: "super_admin" } as never,
    });
    await expect(isRouteAdmin()).resolves.toBe(true);

    validateActiveSessionMock.mockResolvedValue({
      ok: true,
      profile: { id: "admin-1", role: "master" } as never,
    });
    await expect(isRouteAdmin()).resolves.toBe(true);
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
