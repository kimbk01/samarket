/**
 * 알림 최종 설계 §5-5 (Owner 승인 2026-11-01 D2) — 내 신고 내역 4종 · 신고 처리 알림 목적지.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildMyReportDetailPath,
  isMyReportSource,
  myReportSourceFromChatReportSource,
} from "@/lib/reports/my-report-paths";
import { mapNotificationEventToInboxRow } from "@/lib/notifications/inbox-events-merge";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("my reports", () => {
  it("paths and source mapping", () => {
    expect(buildMyReportDetailPath("trade", " r1 ")).toBe("/mypage/reports/trade/r1");
    expect(isMyReportSource("trade_chat")).toBe(true);
    expect(isMyReportSource("x")).toBe(false);
    expect(myReportSourceFromChatReportSource("trade_report")).toBe("trade");
    expect(myReportSourceFromChatReportSource("messenger")).toBe("messenger");
  });

  it("report-processed writers point to the report detail (not /philife · /market · none)", () => {
    expect(read("lib/notifications/notify-community-moderation.ts")).toContain(
      'link_url: buildMyReportDetailPath("community", args.reportId)'
    );
    expect(read("lib/notifications/notify-trade-moderation.ts")).toContain(
      'link_url: buildMyReportDetailPath("trade", args.reportId)'
    );
    expect(read("lib/admin-chat-reports/notify-chat-report-result.ts")).toContain(
      "link_url: buildMyReportDetailPath(mySource, input.reportId)"
    );
  });

  it("older stored rows open the report detail at read time", () => {
    const row = mapNotificationEventToInboxRow({
      id: "e1",
      user_id: "u1",
      type: "admin_notice",
      category: "admin_notice",
      title: "신고가 처리되었습니다",
      body: "",
      unread: true,
      read_at: null,
      created_at: "2026-10-01T00:00:00Z",
      display_payload: {
        routeUrl: "/philife",
        legacyMeta: { kind: "community_report_processed", report_id: "11111111-1111-1111-1111-111111111111" },
      },
    } as never);
    expect(row.link_url).toBe("/mypage/reports/community/11111111-1111-1111-1111-111111111111");
  });
});
