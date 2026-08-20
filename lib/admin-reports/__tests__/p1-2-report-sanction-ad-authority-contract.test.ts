import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  looksLikeProfileUserId,
  TRADE_REPORT_ACCOUNT_ACTIONS_MCC_ONLY,
  TRADE_REPORT_CONTENT_ACTIONS,
  TRADE_REPORT_LEDGER_ACTIONS,
} from "@/lib/admin-reports/applyReportActionDaangn";
import { mapCommunityReportsToReports } from "@/lib/admin-reports/map-community-reports";

const ROOT = path.resolve(__dirname, "../../..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

describe("P1-2 report / sanction / ad authority contract", () => {
  it("splits Trade content vs MCC account vs ledger actions", () => {
    expect([...TRADE_REPORT_CONTENT_ACTIONS].sort()).toEqual(["product_hide", "reject"]);
    expect([...TRADE_REPORT_ACCOUNT_ACTIONS_MCC_ONLY].sort()).toEqual([
      "account_ban",
      "account_suspend",
    ]);
    expect([...TRADE_REPORT_LEDGER_ACTIONS].sort()).toEqual(["chat_ban", "warn"]);
  });

  it("applyReportActionDaangn refuses account_* and chat ledger without profile", () => {
    const src = read("lib/admin-reports/applyReportActionDaangn.ts");
    expect(src).toContain("TRADE_REPORT_ACCOUNT_ACTIONS_MCC_ONLY");
    expect(src).toContain("계정 정지/차단은 MCC");
    expect(src).toContain("isChatTarget");
    expect(src).toContain('.from("profiles")');
    expect(src).not.toMatch(/SANCTION_TYPE_MAP[\s\S]*account_suspend/);
    expect(src).not.toMatch(/account_suspend:\s*"temp_suspend"/);
  });

  it("AdminSanctionPanel routes account CTA to MCC link (no account_* writer button)", () => {
    const src = read("components/admin/reports/AdminSanctionPanel.tsx");
    expect(src).toContain("admin-report-mcc-sanction-link");
    expect(src).toContain("admin-report-authority-banner");
    expect(src).toContain("/admin/users/");
    expect(src).not.toMatch(/onClick=\{\(\) => void handleAction\("account_ban"\)\}/);
    expect(src).not.toMatch(/type:\s*"account_suspend"/);
  });

  it("chat report rows do not use room id as targetUserId", () => {
    const src = read("lib/admin-reports/getReportsFromDb.ts");
    expect(src).toContain('targetType === "chat"');
    expect(src).toMatch(/targetType === "chat"\s*\?[\s\S]{0,40}""/);
    expect(src).toContain("Never treat room/message id as profiles.user_id");
  });

  it("mapCommunityReports fills author + keeps community_feed source", () => {
    const mapped = mapCommunityReportsToReports(
      [
        {
          id: "cr1",
          target_type: "post",
          target_id: "p1",
          reporter_id: "r1",
          reason_type: "spam",
          reason_text: null,
          status: "open",
          admin_memo: null,
          processed_at: null,
          created_at: "2026-01-01T00:00:00.000Z",
          post_title: "hello",
          post_author_id: "author-1",
        },
      ],
      { r1: "Reporter" }
    );
    expect(mapped[0]?.reportSource).toBe("community_feed");
    expect(mapped[0]?.targetUserId).toBe("author-1");
    expect(mapped[0]?.adminDetailHref).toContain("/admin/reports/cr1");
  });

  it("global report center exposes domain authority entries", () => {
    const src = read("components/admin/reports/AdminReportListPage.tsx");
    expect(src).toContain("admin-report-domain-authority-links");
    expect(src).toContain("/admin/community/reports");
    expect(src).toContain("/admin/store-reports");
    expect(src).toContain("/admin/chats/reported");
    expect(src).toContain("/admin/community/posts/");
  });

  it("ad applications keep separate writers (no unified ads table)", () => {
    const src = read("components/admin/ads/AdminAdApplicationsPage.tsx");
    expect(src).toContain('data-admin-writer="point_promotion_orders"');
    expect(src).toContain("feed_ad_requests");
    expect(src).toContain("NOT a unified ads table");
    expect(src).not.toContain("unified_ads");
  });

  it("looksLikeProfileUserId accepts UUID only", () => {
    expect(looksLikeProfileUserId("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(looksLikeProfileUserId("room-not-a-user")).toBe(false);
    expect(looksLikeProfileUserId("")).toBe(false);
  });

  it("Trade product_hide Cut A contract preserved", () => {
    const src = read("lib/admin-reports/applyReportActionDaangn.ts");
    expect(src).toMatch(/product_hide[\s\S]*visibility:\s*"hidden"/);
    expect(src).toMatch(/status:\s*"hidden"/);
  });
});
