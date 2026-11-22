/**
 * 2026-11-22 관리자 폴링 한 요청으로 — admin-bell?with_inbox=1 이 받은 알림 요약을 함께, 헤더 아이콘은 따로 폴링하지 않음.
 * 설계: docs/audit/supabase-request-surge-2026-11-18/admin-inbox-bell-polling-design-2026-11-22.md
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  adminInboxSummaryViewFromPayload,
  isAdminInboxSummaryDue,
  peekAdminInboxSummary,
  publishAdminInboxSummary,
  resetAdminInboxSummaryForTests,
} from "@/lib/admin/notifications/admin-inbox-summary-client";
import { NOTIFICATION_SYNC_POLL_MS } from "@/lib/notifications/notification-events";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

beforeEach(() => resetAdminInboxSummaryForTests());

describe("요약 표시값 = 이전 아이콘 판정", () => {
  it("숫자·전달 실패 「!」·응답 실패", () => {
    expect(adminInboxSummaryViewFromPayload({ ok: true, unread: 3 })).toEqual({ unread: 3, failed: false });
    expect(adminInboxSummaryViewFromPayload({ ok: true, unread: 2, delivery: { outboxDead: 1 } })).toEqual({ unread: 2, failed: true });
    expect(adminInboxSummaryViewFromPayload({ ok: true, unread: 0, delivery: { unavailable: true } }).failed).toBe(true);
    expect(adminInboxSummaryViewFromPayload({ ok: false })).toEqual({ unread: 0, failed: true });
    expect(adminInboxSummaryViewFromPayload({ ok: true, unread: 5 }, false).failed).toBe(true);
  });
});

describe("75초에 1번만 함께", () => {
  it("처음엔 받고, 받은 뒤 75초 안에는 안 받고, 지나면 다시", () => {
    const t0 = 1_000_000;
    expect(isAdminInboxSummaryDue(t0)).toBe(true);
    publishAdminInboxSummary({ unread: 1, failed: false }, t0);
    expect(peekAdminInboxSummary()).toEqual({ unread: 1, failed: false });
    expect(isAdminInboxSummaryDue(t0 + 30_000)).toBe(false);
    expect(isAdminInboxSummaryDue(t0 + NOTIFICATION_SYNC_POLL_MS)).toBe(true);
  });
});

describe("연결", () => {
  it("admin-bell: with_inbox=1 이면 같은 요약 함수 · 관리자 확인 1번 · 두 숫자 따로", () => {
    const src = read("app/api/admin/admin-bell/route.ts");
    expect(src).toContain('req.nextUrl.searchParams.get("with_inbox") === "1"');
    expect(src).toContain("loadAdminInboxSummary(gate.sb, gate.actor)");
    expect(src.indexOf("requireAdminApiActor()")).toBeLessThan(src.indexOf("loadAdminInboxSummary(gate.sb"));
    expect(src).toContain("...(inbox ? { inbox } : {})");
  });
  it("헤더 아이콘은 75초 폴링을 하지 않고 요약 이벤트로 받는다", () => {
    const src = read("components/admin/inbox/AdminInboxLink.tsx");
    expect(src).not.toContain("setInterval");
    expect(src).toContain("ADMIN_INBOX_SUMMARY_EVENT");
    expect(src).toContain("ADMIN_INBOX_CHANGED_EVENT");
  });
  it("작업 대기 수 폴러가 때가 되면 요약을 함께 받아 넘긴다", () => {
    const src = read("components/admin/store-points/AdminStorePointPendingProvider.tsx");
    expect(src).toContain("const withInbox = isAdminInboxSummaryDue();");
    expect(src).toContain('"/api/admin/admin-bell?with_inbox=1"');
    expect(src).toContain("publishAdminInboxSummary(adminInboxSummaryViewFromPayload(json.inbox ?? null");
  });
});
