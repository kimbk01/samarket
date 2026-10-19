import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { adminMenu } from "@/components/admin/admin-menu";
import { findAdminMenuByKey } from "@/lib/admin/find-admin-menu-item";
import { resolveWorkspaceRootPath } from "@/lib/admin/admin-workspace-routing";
import { DOMAIN_RESET_SCOPE_PRESETS } from "@/lib/admin/prelaunch-reset/domain-reset-entry";

function read(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("ARO-OPS-UX-002-B2 domain dashboard contract", () => {
  it("shared shell + four loaders exist (no parallel v2 / mutation)", () => {
    const shell = read("components/admin/domain-dashboard/AdminDomainDashboardShell.tsx");
    expect(shell).toContain('data-aro-ops-ux-002-b2="1"');
    expect(shell).toContain("action-required");
    expect(shell).toContain("current-state");

    for (const f of [
      "lib/admin/domain-dashboard/load-delivery-domain-dashboard.ts",
      "lib/admin/domain-dashboard/load-trade-domain-dashboard.ts",
      "lib/admin/domain-dashboard/load-community-domain-dashboard.ts",
      "lib/admin/domain-dashboard/load-messenger-domain-dashboard.ts",
    ]) {
      const src = read(f);
      expect(src).not.toMatch(/from\(["'].*v2/);
      expect(src).not.toMatch(/\.(insert|update|delete|upsert)\(/);
    }
  });

  it("routes exist for four domain dashboards", () => {
    expect(read("app/admin/delivery/page.tsx")).toContain("loadDeliveryDomainDashboard");
    expect(read("app/admin/trade/page.tsx")).toContain("loadTradeDomainDashboard");
    expect(read("app/admin/community/page.tsx")).toContain("loadCommunityDomainDashboard");
    expect(read("app/admin/messenger/page.tsx")).toContain("loadMessengerDomainDashboard");
  });

  it("menu entries: delivery + messenger hubs are workspace roots", () => {
    expect(findAdminMenuByKey(adminMenu, "delivery-dashboard")?.path).toBe("/admin/delivery");
    expect(findAdminMenuByKey(adminMenu, "messenger-hub")?.path).toBe("/admin/messenger");
    expect(findAdminMenuByKey(adminMenu, "trade-hub")?.path).toBe("/admin/trade");
    expect(findAdminMenuByKey(adminMenu, "community-home")?.path).toBe("/admin/community");

    const delivery = adminMenu.find((m) => m.key === "delivery")!;
    const messenger = adminMenu.find((m) => m.key === "messenger")!;
    expect(resolveWorkspaceRootPath(delivery)).toBe("/admin/delivery");
    expect(resolveWorkspaceRootPath(messenger)).toBe("/admin/messenger");
  });

  it("trade posts list remains separate from dashboard", () => {
    expect(findAdminMenuByKey(adminMenu, "posts-management")?.path).toBe("/admin/posts-management");
    const tradeDash = read("app/admin/trade/page.tsx");
    expect(tradeDash).not.toContain("AdminPostsManagement");
  });

  it("messenger authorities stay separate in read-model", () => {
    // 채팅 설계 §6: 방 수는 CM chat_domain 단일 기준 (거래 = chat_domain=trade, 빈 레거시 product_chats 아님)
    const src = read("lib/admin/domain-dashboard/load-messenger-domain-dashboard.ts");
    const loader = read("lib/admin/metrics/load-chat-metrics.ts");
    const defs = read("lib/admin/metrics/chat-metrics.ts");
    expect(src).toContain("loadChatMetrics");
    expect(src).not.toContain('from("product_chats")');
    expect(loader).toContain('"community_messenger_rooms"');
    expect(loader).toContain('eq("chat_domain", domain)');
    expect(defs).toContain("/admin/chats/general");
    expect(defs).toContain("/admin/chats/group");
    // 설계 v2 §3-1: 거래·배달 주문 방 지표도 CM 채팅방 목록(같은 필터)으로.
    expect(defs).toContain("/admin/chats?type=trade");
    expect(defs).toContain("/admin/chats?type=store_order");
  });

  it("reset context entries use B1R presets", () => {
    const trade = read("lib/admin/domain-dashboard/load-trade-domain-dashboard.ts");
    const community = read("lib/admin/domain-dashboard/load-community-domain-dashboard.ts");
    const messenger = read("lib/admin/domain-dashboard/load-messenger-domain-dashboard.ts");
    expect(trade).toContain("DOMAIN_RESET_SCOPE_PRESETS.trade");
    expect(community).toContain("DOMAIN_RESET_SCOPE_PRESETS.community");
    expect(messenger).toContain("DOMAIN_RESET_SCOPE_PRESETS.chat");
    expect(DOMAIN_RESET_SCOPE_PRESETS.trade).toEqual(["trade_content"]);
  });

  it("community W3 list owners unchanged", () => {
    expect(findAdminMenuByKey(adminMenu, "community-posts")?.path).toBe("/admin/community/posts");
    expect(findAdminMenuByKey(adminMenu, "community-feed-reports")?.path).toBe(
      "/admin/community/reports"
    );
  });
});
