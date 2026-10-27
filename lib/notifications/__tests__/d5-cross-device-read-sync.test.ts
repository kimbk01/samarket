/**
 * 재감사 D-5 (docs/audit/notification-full-reaudit-2026-10-27.md, P-6) — 다른 기기·탭의 읽음·삭제 동기화.
 * 원인: Realtime 이 notification_events INSERT 만 구독했다. N-05(화면 복귀 재조회·숫자 비교 재조회)는
 * 클라이언트 우회라 제거하고, 읽음·삭제 UPDATE 구독 + 재연결 1회 따라잡기로 바꾼다.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isNotificationEventReadOrDismissUpdate } from "@/hooks/useSupabaseNotificationsRealtime";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("D-5 read/dismiss UPDATE filter", () => {
  it("ignores push handoff updates on a still-unread row", () => {
    expect(
      isNotificationEventReadOrDismissUpdate({
        unread: true,
        read_at: null,
        push_handoff_status: "handed_off",
        display_payload: {},
      })
    ).toBe(false);
  });

  it("reacts to read (unread=false / read_at)", () => {
    expect(isNotificationEventReadOrDismissUpdate({ unread: false, read_at: "2026-10-27T08:00:00Z" })).toBe(true);
  });

  it("reacts to soft delete without read (DELETE WITHOUT READ)", () => {
    expect(
      isNotificationEventReadOrDismissUpdate({
        unread: true,
        read_at: null,
        display_payload: { deleted_at: "2026-10-27T08:00:00Z", inbox_dismissed_at: "2026-10-27T08:00:00Z" },
      })
    ).toBe(true);
  });
});

describe("D-5 subscription contract", () => {
  it("subscribes notification_events UPDATE for the viewer and re-syncs once on reconnect", () => {
    const hook = read("hooks/useSupabaseNotificationsRealtime.ts");
    expect(hook).toMatch(/event: "UPDATE",\s*schema: "public",\s*table: "notification_events"/);
    expect(hook).toContain("isNotificationEventReadOrDismissUpdate(ev.new)");
    expect(hook).toContain('onChangeRef.current({ eventType: "RESYNC" })');
  });

  it("bridge refetches the badge authority on read/dismiss UPDATE and reconnect", () => {
    const bridge = read("components/notifications/NotificationsBadgeRealtimeBridge.tsx");
    expect(bridge).toContain('requestNotificationBadgeCountResync("realtime_read_sync")');
  });

  it("N-05 client workaround is gone (no visibility resync, no count-mismatch resync)", () => {
    const store = read("lib/notifications/notification-badge-count-store.ts");
    expect(store).not.toContain("foreground_resume");
    expect(store).not.toContain("visibilitychange");
    const view = read("components/my/MyNotificationsView.tsx");
    expect(view).not.toContain("notification_center_count_mismatch");
  });
});
