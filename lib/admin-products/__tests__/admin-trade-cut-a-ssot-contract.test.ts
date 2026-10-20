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

  it("S3: product_hide → admin_decide_trade_report (moderation_state, no direct status write)", () => {
    // 거래 Admin 설계 v2 §C-4: applyReportActionDaangn 삭제 — 숨김은 DB 함수 한 트랜잭션에서 moderation_state 로.
    const src = read("lib/admin/trade-admin/trade-report-decision.ts");
    expect(src).toMatch(/case "product_hide":[\s\S]*decision: "hide"/);
    expect(src).toContain('"admin_decide_trade_report"');
    expect(src).not.toMatch(/status:\s*"hidden"/);
  });

  it("S3: /status SELECT survives missing posts.visibility column", () => {
    const src = read("app/api/admin/posts/[postId]/status/route.ts");
    // Authority: SELECT never asks for posts.visibility (prod has no column); no fail→retry probe.
    // 거래 Admin 설계 v2 §F-1-1: 숨김·삭제는 admin_trade_post_moderate (moderation_state) — selectNoVis 상수는 제거됨.
    expect(src).toContain('"admin_trade_post_moderate"');
    expect(src).not.toMatch(/\.select\(\s*["'`][^"'`]*visibility/);
    expect(src).not.toMatch(/42703[\s\S]{0,80}select|select[\s\S]{0,80}42703/);
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
