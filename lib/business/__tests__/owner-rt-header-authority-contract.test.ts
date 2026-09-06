import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..");

function readRepo(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("owner P2 RT / header / badge authority", () => {
  it("hub and orders use distinct store_orders channel topics", () => {
    const hubHook = readRepo("hooks/useSupabaseStoreOrdersRealtime.ts");
    const ordersHook = readRepo("hooks/stores/useOwnerStoreOrdersRealtime.ts");
    expect(hubHook).toContain("`store-orders-rt:${sid}`");
    expect(ordersHook).toContain("`owner-store-orders-rt:${sid}`");
  });

  it("BusinessAdminShell skips counts poll when OwnerHubRuntimeProvider is present", () => {
    const shell = readRepo("components/business/admin/BusinessAdminShell.tsx");
    expect(shell).toMatch(/if \(hubRuntime\) return;/);
    expect(shell).toContain("hubRuntime?.orderAlertsBadge ?? orderAlertsBadge");
  });

  it("dashboard keeps subscribeOrdersRefresh for ops snapshot only", () => {
    const dash = readRepo("components/business/admin/dashboard/BusinessAdminDashboard.tsx");
    expect(dash).toContain("subscribeOrdersRefresh");
    expect(dash).toContain("peekOwnerStoreOpsSnapshotFromHubCache");
    expect(dash).toContain("useSupabaseStoreOrdersRealtime(hubRuntime ? null");
  });

  it("canonical chrome mounts via OwnerChromeHeader (one shell API)", () => {
    const shell = readRepo("components/business/admin/BusinessAdminShell.tsx");
    expect(shell).toContain("OwnerChromeHeader");
    expect(shell).toContain("isOwnerStoreProductComposerRoute");
    expect(shell).toContain('data-owner-empty-hub-shell="1"');
    expect(shell).not.toMatch(/isHub && !selectedRow[\s\S]{0,280}min-h-screen/);
    expect(shell).not.toMatch(/<OwnerMobileAdminHeader[\s\S]{0,40}variant=/);
    expect(shell).not.toMatch(/<StoresOwnerStackHeader[\s\S]{0,40}variant=/);
  });

  it("product hub filters are local category/status controls not DibaySecondaryTabRow nav", () => {
    const hub = readRepo("components/business/owner/OwnerProductsHubClient.tsx");
    expect(hub).toContain("statusFilter");
    expect(hub).toContain("ownerHubCategoryPillClass");
    expect(hub).not.toContain("DibaySecondaryTabRow");
  });

  it("order chat ensure outbound stays on canonical owner route", () => {
    const surface = readRepo("lib/chats/surfaces/order-chat-surface.ts");
    expect(surface).toContain("/stores/owner/order-chat/");
    expect(surface).not.toContain("/my/business/store-order-chat/");
  });

  it("orders foreground visibility load is single authority (pageshow hook disables visibility)", () => {
    const view = readRepo("components/business/owner/OwnerStoreOrdersView.tsx");
    expect(view).toContain("enableVisibilityRefetch: false");
    expect(view).toContain('safeSilentLoad("visibility_visible")');
    const hub = readRepo("components/business/owner/OwnerHubRuntimeProvider.tsx");
    expect(hub).not.toContain("invalidateOwnerHubDashboardOrdersCache");
  });
});
