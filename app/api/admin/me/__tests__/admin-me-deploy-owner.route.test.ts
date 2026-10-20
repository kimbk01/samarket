import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminApiActor = vi.fn();

vi.mock("@/lib/admin/require-admin-permission", () => ({
  requireAdminApiActor: (...args: unknown[]) => requireAdminApiActor(...args),
  requireSuperAdmin: vi.fn(),
}));
vi.mock("@/lib/admin/admin-membership", () => ({
  loadActiveAdminMembership: vi.fn(async () => ({ admin_tier: "super_admin" })),
}));
vi.mock("@/lib/admin/admin-user-server", () => ({
  adminTierToUiRole: vi.fn(() => "operator"),
  loadEffectiveStaffPermissions: vi.fn(async () => []),
}));

const OWNER_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_ID = "22222222-2222-2222-2222-222222222222";

function actor(userId: string, isSuperAdmin: boolean) {
  return {
    ok: true,
    sb: {},
    actor: {
      userId,
      profile: { username: "u", nickname: "n" },
      role: isSuperAdmin ? "super_admin" : "admin",
      permissions: ["users"],
      isSuperAdmin,
    },
  };
}

async function callMe(): Promise<Record<string, unknown>> {
  const { GET } = await import("@/app/api/admin/me/route");
  const res = await GET();
  return (await res.json()) as Record<string, unknown>;
}

describe("GET /api/admin/me — isDeployOwner", () => {
  const prev = process.env.DIBAY_DEPLOY_OWNER_IDS;
  beforeEach(() => {
    requireAdminApiActor.mockReset();
    process.env.DIBAY_DEPLOY_OWNER_IDS = OWNER_ID.toUpperCase();
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.DIBAY_DEPLOY_OWNER_IDS;
    else process.env.DIBAY_DEPLOY_OWNER_IDS = prev;
  });

  it("목록에 있는 super_admin → true (기존 필드 유지)", async () => {
    requireAdminApiActor.mockResolvedValue(actor(OWNER_ID, true));
    const body = await callMe();
    expect(body).toMatchObject({ ok: true, userId: OWNER_ID, role: "super_admin", isDeployOwner: true });
    expect(body).toHaveProperty("uiRole");
    expect(body).toHaveProperty("permissions");
  });

  it("목록에 없는 super_admin → false", async () => {
    requireAdminApiActor.mockResolvedValue(actor(OTHER_ID, true));
    expect((await callMe()).isDeployOwner).toBe(false);
  });

  it("목록에 있어도 super_admin 이 아니면 false (requireDeployOwner 와 같은 판정)", async () => {
    requireAdminApiActor.mockResolvedValue(actor(OWNER_ID, false));
    expect((await callMe()).isDeployOwner).toBe(false);
  });

  it("목록 미설정 → false (fail-closed)", async () => {
    delete process.env.DIBAY_DEPLOY_OWNER_IDS;
    requireAdminApiActor.mockResolvedValue(actor(OWNER_ID, true));
    expect((await callMe()).isDeployOwner).toBe(false);
  });
});
