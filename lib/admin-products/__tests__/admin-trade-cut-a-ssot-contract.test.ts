import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ADMIN_TRADE_OPEN_REPORT_STATUSES } from "@/lib/admin-products/admin-trade-overview-counts";

const ROOT = path.resolve(__dirname, "../../..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

describe("Cut A Trade Admin SSOT (S1–S5)", () => {
  it("S1+S2: Overview open-report set is pending|reviewing and export is shared", () => {
    expect([...ADMIN_TRADE_OPEN_REPORT_STATUSES]).toEqual(["pending", "reviewing"]);
    const overview = read("lib/admin-products/admin-trade-overview-counts.ts");
    expect(overview).toContain('.eq("type", "trade")');
    expect(overview).toContain("ADMIN_TRADE_OPEN_REPORT_STATUSES");
    const list = read("lib/admin-products/admin-posts-management-data.ts");
    expect(list).toContain("ADMIN_TRADE_OPEN_REPORT_STATUSES");
    expect(list).toContain('.eq("type", "trade")');
  });

  it("S3: product_hide writes visibility=hidden with status=hidden", () => {
    const src = read("lib/admin-reports/applyReportActionDaangn.ts");
    expect(src).toMatch(/product_hide[\s\S]*visibility:\s*"hidden"/);
    expect(src).toMatch(/status:\s*"hidden"/);
  });

  it("S3: /status SELECT survives missing posts.visibility column", () => {
    const src = read("app/api/admin/posts/[postId]/status/route.ts");
    expect(src).toContain("selectNoVis");
    expect(src).toMatch(/visibility\|column\|42703/);
  });

  it("S4: /status active|reserved align seller_listing_state", () => {
    const src = read("app/api/admin/posts/[postId]/status/route.ts");
    expect(src).toContain('status === "active"');
    expect(src).toContain('seller_listing_state = "inquiry"');
    expect(src).toContain('status === "reserved"');
    expect(src).toContain('seller_listing_state = "reserved"');
    expect(src).toContain('seller_listing_state = "completed"');
  });

  it("S5: Admin trade chat merge prefers product_chats", () => {
    const src = read("components/admin/chats/AdminChatListPage.tsx");
    expect(src).toContain('s === "product_chats" ? 2 : 1');
    expect(src).not.toContain('s === "chat_rooms" ? 2 : 1');
  });
});
