/**
 * C-2 (Owner 승인 2026-11-01) — 알림 상세: 머리 제목·보낸 곳·신고 결과 카드·하단 버튼은 저장된 값만으로 정한다.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  formatNotificationDetailDateTime,
  resolveNotificationDetailPresentation,
} from "@/lib/notifications/notification-detail-presentation";

const base = { meta: null, hasExternalUrl: false, originUnavailable: false };

describe("resolveNotificationDetailPresentation", () => {
  it("notice / system / marketing → type header, DIBAY ops sender, list CTA", () => {
    for (const [domain, key] of [
      ["notice", "notif_detail_header_notice"],
      ["system", "notif_detail_header_system"],
      ["marketing", "notif_detail_header_marketing"],
    ] as const) {
      const p = resolveNotificationDetailPresentation({ ...base, domain });
      expect(p.headerKey).toBe(key);
      expect(p.sender).toEqual({ kind: "ops" });
      expect(p.reportFacts).toBeNull();
      expect(p.primaryCta).toEqual({ kind: "list" });
    }
  });

  it("server-allowed external link → external CTA first", () => {
    const p = resolveNotificationDetailPresentation({ ...base, domain: "notice", hasExternalUrl: true });
    expect(p.primaryCta).toEqual({ kind: "external" });
  });

  it("report result → facts card + support CTA; rejected/reviewing are not emphasized", () => {
    const p = resolveNotificationDetailPresentation({
      ...base,
      domain: "system",
      meta: { kind: "chat_report_result", action: "sanction_message_hide", source: "messenger" },
    });
    expect(p.headerKey).toBe("notif_detail_header_report");
    expect(p.reportFacts).toEqual({
      resultKey: "notif_detail_report_result_message_hide",
      positive: true,
      sourceKey: "notif_detail_report_source_messenger",
    });
    expect(p.primaryCta).toEqual({ kind: "support", href: "/support/enter" });
    const rejected = resolveNotificationDetailPresentation({
      ...base,
      domain: "system",
      meta: { kind: "chat_report_result", action: "rejected", source: "trade_chat" },
    });
    expect(rejected.reportFacts?.positive).toBe(false);
    expect(rejected.reportFacts?.sourceKey).toBe("notif_detail_report_source_trade_chat");
  });

  it("origin unavailable → domain home CTA only for existing homes", () => {
    expect(
      resolveNotificationDetailPresentation({ ...base, domain: "community", originUnavailable: true }).primaryCta
    ).toEqual({ kind: "domain_home", href: "/philife", labelKey: "notif_detail_cta_domain_home" });
    expect(
      resolveNotificationDetailPresentation({ ...base, domain: "notice", originUnavailable: true }).primaryCta
    ).toEqual({ kind: "list" });
  });

  it("member activity → stored sender label, generic header", () => {
    const p = resolveNotificationDetailPresentation({
      ...base,
      domain: "community",
      meta: { kind: "community_comment", commenter_label: "zxzx11" },
    });
    expect(p.headerKey).toBe("notif_detail_header_generic");
    expect(p.sender).toEqual({ kind: "member", name: "zxzx11" });
  });
});

describe("formatNotificationDetailDateTime", () => {
  it("full date + weekday + time; invalid → empty", () => {
    expect(formatNotificationDetailDateTime("2026-11-01T00:34:00Z", "ko")).toMatch(
      /^2026\.11\.0[12] \([일월]\) (오전|오후) \d{1,2}:\d{2}$/
    );
    expect(formatNotificationDetailDateTime("x", "ko")).toBe("");
  });
});

describe("detail page wiring", () => {
  const src = readFileSync(join(process.cwd(), "app/(main)/notifications/[notificationId]/page.tsx"), "utf8");
  it("uses the presentation helper and replaces 「확인했습니다」 with 「알림 목록으로」", () => {
    expect(src).toContain("resolveNotificationDetailPresentation({");
    expect(src).toContain('t("notif_detail_cta_list")');
    expect(src).not.toContain("notif_detail_confirm");
    expect(src).toContain("data-notification-detail-report");
  });
});
