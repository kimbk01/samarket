import { beforeEach, describe, expect, it, vi } from "vitest";

const updateStoreDiscoveryCampaignAdmin = vi.fn();
const appendAdminRouteAudit = vi.fn();

vi.mock("@/lib/admin/require-admin-permission", () => ({
  requireAdminPermission: async () => ({ ok: true, actor: { userId: "admin-1" }, sb: {} }),
}));
vi.mock("@/lib/auth/is-route-admin", () => ({ isRouteAdmin: async () => true }));
vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => ({}) }));
vi.mock("@/lib/admin/audit/append-admin-route-audit", () => ({
  appendAdminRouteAudit: (...a: unknown[]) => appendAdminRouteAudit(...a),
}));
vi.mock("@/lib/stores/store-discovery-campaign-writer", () => ({
  createStoreDiscoveryCampaignAdmin: vi.fn(),
  updateStoreDiscoveryCampaignAdmin: (...a: unknown[]) => updateStoreDiscoveryCampaignAdmin(...a),
}));

import { PATCH } from "@/app/api/admin/store-discovery/campaigns/route";

function call(body: Record<string, unknown>) {
  return PATCH(
    new Request("https://x.test/api/admin/store-discovery/campaigns", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }) as never
  );
}

beforeEach(() => vi.clearAllMocks());

describe("store discovery campaigns PATCH — CAS status mapping", () => {
  it.each([
    ["stale_updated_at", 409],
    ["expected_updated_at_required", 400],
  ])("%s → %d, no audit", async (error, status) => {
    updateStoreDiscoveryCampaignAdmin.mockResolvedValue({ ok: false, error });
    const res = await call({ id: "c-1", title: "N" });
    expect(res.status).toBe(status);
    expect(((await res.json()) as { error: string }).error).toBe(error);
    expect(appendAdminRouteAudit).not.toHaveBeenCalled();
  });
});
