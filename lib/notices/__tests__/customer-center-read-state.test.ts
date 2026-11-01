/**
 * 알림 최종 설계 §5 (Owner 승인 2026-11-01) — 고객센터 글 읽음·안읽음·N.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CUSTOMER_CENTER_NEW_BADGE_DAYS,
  isCustomerCenterContentNew,
  isCustomerCenterContentUnread,
} from "@/lib/notices/customer-center-read-state";
import { BOARD_LABEL } from "@/lib/notices/customer-center-content";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("customer center read state", () => {
  it("unread = no view record AND published after joining (D5)", () => {
    const joinedAt = "2026-10-01T00:00:00Z";
    expect(isCustomerCenterContentUnread({ read: false, publishedAt: "2026-10-20T00:00:00Z", joinedAt })).toBe(true);
    expect(isCustomerCenterContentUnread({ read: true, publishedAt: "2026-10-20T00:00:00Z", joinedAt })).toBe(false);
    expect(isCustomerCenterContentUnread({ read: false, publishedAt: "2026-09-01T00:00:00Z", joinedAt })).toBe(false);
    expect(isCustomerCenterContentUnread({ read: false, publishedAt: "2026-09-01T00:00:00Z", joinedAt: null })).toBe(true);
  });

  it("N = published within 7 days (D3)", () => {
    const now = Date.parse("2026-11-01T00:00:00Z");
    expect(CUSTOMER_CENTER_NEW_BADGE_DAYS).toBe(7);
    expect(isCustomerCenterContentNew("2026-10-28T00:00:00Z", now)).toBe(true);
    expect(isCustomerCenterContentNew("2026-10-20T00:00:00Z", now)).toBe(false);
    expect(isCustomerCenterContentNew("2026-11-05T00:00:00Z", now)).toBe(false);
  });

  it("board names = admin and app 1:1", () => {
    expect(BOARD_LABEL.notice.ko).toBe("공지사항");
    expect(BOARD_LABEL.system.ko).toBe("시스템 안내");
    expect(BOARD_LABEL.marketing.ko).toBe("혜택·이벤트");
  });

  it("wiring: list = published_at order + read/isNew + unread filter + mark-all; view syncs notification read", () => {
    const list = read("app/api/me/settings/notices/route.ts");
    expect(list).toContain('.order("published_at", { ascending: false, nullsFirst: false })');
    expect(list).toContain('sp.get("filter") === "unread"');
    expect(list).toContain("read: !unreadOf(row)");
    expect(list).toContain('body.action !== "mark_all_read"');
    const view = read("app/api/me/settings/notices/[noticeId]/view/route.ts");
    expect(view).toContain("markNotificationsReadForContents(sb, auth.userId, [contentId])");
    const state = read("lib/notices/customer-center-read-state.ts");
    // 「모두 읽음」은 조회수를 올리지 않는다(RPC 미사용)
    expect(state).not.toContain("record_customer_center_content_view");
    expect(state).toContain("patchInboxNotificationIdsRead(sb, userId, eventIds)");
    const detail = read("components/mypage/cs/CustomerCenterBoardDetailClient.tsx");
    expect(detail).toContain('data-testid="cc-detail-list-cta"');
    expect(detail).toContain('"cc-detail-prev"');
  });
});
