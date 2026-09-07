import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { adminMenu } from "@/components/admin/admin-menu";
import { findAdminMenuByKey } from "@/lib/admin/find-admin-menu-item";

const ROOT = path.resolve(__dirname, "../../..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

describe("P1-3 Admin orphan / menu finalization", () => {
  it("operations route redirects to /admin (quarantine closed, file kept)", () => {
    const src = read("app/admin/operations/page.tsx");
    expect(src).toContain("permanentRedirect");
    expect(src).toContain('"/admin"');
    expect(src).not.toContain("AdminOperationsHubPage");
    const cfg = read("next.config.js");
    expect(cfg).toMatch(/source:\s*"\/admin\/operations"/);
    expect(cfg).toMatch(/destination:\s*"\/admin"/);
  });

  it("messenger menu has general+group LIVE; no community/business leaves", () => {
    const messenger = findAdminMenuByKey(adminMenu, "messenger");
    const keys = new Set((messenger?.children ?? []).map((c) => c.key));
    expect(keys.has("chat-general")).toBe(true);
    expect(keys.has("chat-group")).toBe(true);
    expect(keys.has("chat-community")).toBe(false);
    expect(keys.has("chat-business")).toBe(false);
    expect(findAdminMenuByKey(adminMenu, "chat-general")?.status).toBe("done");
    expect(findAdminMenuByKey(adminMenu, "chat-group")?.status).toBe("done");
  });

  it("ads-legacy is demoted partial (routes KEEP)", () => {
    const legacy = findAdminMenuByKey(adminMenu, "ads-legacy");
    expect(legacy?.status).toBe("partial");
    // Owner Policy LOCK: Feed hub absorbed under legacy (PUBLIC → advertising workspace)
    expect(findAdminMenuByKey(adminMenu, "ads-feed")?.status).toBe("partial");
    expect(findAdminMenuByKey(adminMenu, "ads-applications")?.path).toBe(
      "/admin/ad-applications?domain=trade"
    );
  });

  it("legacy boards/comments show quarantine banners (not Community SSOT)", () => {
    const boards = read("components/admin/boards/AdminBoardsPage.tsx");
    expect(boards).toContain('data-admin-quarantine="boards"');
    expect(boards).toContain("admin-legacy-boards-quarantine-banner");
    expect(boards).toContain("/admin/community/topics");
    const comments = read("app/admin/comments/AdminCommentsPageContent.tsx");
    expect(comments).toContain('data-admin-quarantine="comments"');
    expect(comments).toContain("admin-legacy-comments-quarantine-banner");
    expect(comments).toContain("/admin/community/comments");
  });

  it("stale chat-community/business title keys removed from menu map", () => {
    const src = read("components/admin/admin-menu.ts");
    expect(src).not.toMatch(/"chat-community":\s*"admin_menu_chat_community"/);
    expect(src).not.toMatch(/"chat-business":\s*"admin_menu_chat_business"/);
    expect(src).toContain('"chat-general": "admin_menu_chat_general"');
  });

  it("Trade HARD CLOSE surfaces remain in Trade workspace", () => {
    const trade = findAdminMenuByKey(adminMenu, "trade");
    const keys = new Set((trade?.children ?? []).map((c) => c.key));
    expect(keys.has("chat-trade")).toBe(true);
    expect(keys.has("reports-posts")).toBe(true);
    // CUT J: ads-applications moved to ads workspace (ads-trade-promote).
    expect(keys.has("ads-applications")).toBe(false);
    expect(findAdminMenuByKey(adminMenu, "ads-applications")?.path).toBe(
      "/admin/ad-applications?domain=trade"
    );
  });
});
