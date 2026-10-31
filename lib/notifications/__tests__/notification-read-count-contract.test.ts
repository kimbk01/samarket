/**
 * C3·C4 읽음·숫자 계약 HARD LOCK (docs/audit/notification-system-ssot-hardlock-reaudit-2026-11-01.md §3·§4, W3~W5).
 * 동작 테스트가 있는 항목은 해당 테스트가 잠그고(F2·route contract), 여기서는 「한 곳에서만 정한다」 구조를 잠근다.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isNotificationEventUnread,
  NOTIFICATION_EVENT_UNREAD_DEFINITION,
} from "@/lib/notifications/core/notification-unread-predicate";
import { myMessages } from "@/lib/i18n/catalog/my";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("C4 unread definition — one predicate", () => {
  it("unread = unread=true AND read_at IS NULL", () => {
    expect(NOTIFICATION_EVENT_UNREAD_DEFINITION).toBe("unread = true AND read_at IS NULL");
    expect(isNotificationEventUnread({ unread: true, read_at: null })).toBe(true);
    expect(isNotificationEventUnread({ unread: false, read_at: null })).toBe(false);
    expect(isNotificationEventUnread({ unread: true, read_at: "2026-11-01T00:00:00Z" })).toBe(false);
    // 옛 조회(unread 미선택)는 read_at 만으로 판정
    expect(isNotificationEventUnread({ read_at: null })).toBe(true);
  });

  it("bell digit loader, inbox unreadOnly scan and row mapping share the definition", () => {
    const bell = read("lib/notifications/load-bell-explain-unread-events.ts");
    expect(bell).toContain('.eq("unread", true)');
    expect(bell).toContain('.is("read_at", null)');
    const merge = read("lib/notifications/inbox-events-merge.ts");
    expect(merge).toContain('if (opts.unreadOnly) query = query.eq("unread", true).is("read_at", null);');
    expect(merge).toContain("is_read: !isNotificationEventUnread(event),");
    expect(merge).not.toContain('if (opts.unreadOnly) query = query.is("read_at", null);');
  });
});

describe("C4 read — same event, same result on every surface", () => {
  it("push tap (opened) and bell/list/banner taps use patchInboxNotificationIdsRead", () => {
    const pushRead = read("app/api/me/notifications/read/route.ts");
    expect(pushRead).toContain("await patchInboxNotificationIdsRead(sb, userId, [eventId])");
    const listPatch = read("app/api/me/notifications/route.ts");
    expect(listPatch).toContain("await patchInboxNotificationIdsRead(sb, userId, ids)");
    const nav = read("lib/notifications/navigate-notification-destination.ts");
    expect(nav).toContain("input.markRead(ids)");
  });
});

describe("C4 counts — server authority per unit", () => {
  it("member bell header digit = badge authority (not list rows)", () => {
    const bell = read("components/philife/PhilifeHeaderNotificationInbox.tsx");
    expect(bell).toContain("resolveTier1HeaderBellBadgeTotal");
    expect(bell).toContain(": memberBellTotal;");
  });

  it("owner bell digit = server unread_total over the store's owner rows (not the fetched list)", () => {
    const bell = read("components/philife/PhilifeHeaderNotificationInbox.tsx");
    expect(bell).toContain("listSynced ? ownerUnreadTotal : 0");
    expect(bell).not.toContain("listSynced ? rowUnread : 0");
    const route = read("app/api/me/notifications/route.ts");
    expect(route).toContain("fetchUpper: OWNER_UNREAD_TOTAL_SCAN_MAX");
    expect(route).toContain("unreadOnly: true,\n          fetchUpper: OWNER_UNREAD_TOTAL_SCAN_MAX");
  });

  it("group rows show the real event count, never a screen sequence number", () => {
    const list = read("components/notifications/InboxGroupCardList.tsx");
    expect(list).not.toContain("showSequenceIndex");
    expect(list).toContain("item.ids.length > 1");
    expect(myMessages.ko.notif_group_unread_count).toBe("새 알림 {n}건");
    expect(myMessages.ko.notif_group_total_count).toBe("알림 {n}건");
  });

  it("recount triggers: realtime insert/read update, reconnect RESYNC, app resume", () => {
    const bridge = read("components/notifications/NotificationsBadgeRealtimeBridge.tsx");
    expect(bridge).toContain('requestNotificationBadgeCountResync("realtime_read_sync")');
    expect(bridge).toContain('requestNotificationBadgeCountResync("app_resume")');
    expect(bridge).toContain('App.addListener("appStateChange"');
    const hook = read("hooks/useSupabaseNotificationsRealtime.ts");
    expect(hook).toContain('onChangeRef.current({ eventType: "RESYNC" })');
  });
});

describe("C3 surfaces", () => {
  it("bell = recent rows incl. read (default) + unread filter", () => {
    const bell = read("components/philife/PhilifeHeaderNotificationInbox.tsx");
    expect(bell).toContain('const previewItems = bellFilter === "unread" ? unreadPreviewItems : grouped;');
    expect(bell).toContain('t("notif_filter_unread")');
  });

  it("full list silent refresh keeps rows already loaded via 「더 보기」 (W5)", () => {
    const view = read("components/my/MyNotificationsView.tsx");
    expect(view).toContain("const keepLoadedTail = expandedSilent;");
    expect(view).toContain("next = [...batch, ...tail];");
  });

  it("push_only campaigns land on the notification center with an explanation", () => {
    const view = read("components/my/MyNotificationsView.tsx");
    expect(view).toContain('reason={fallbackParam === "push_only" ? "push_only" : "origin_unavailable"}');
    expect(myMessages.ko.notif_push_only_notice).toBe("이 알림은 알림함에 따로 보관되지 않는 푸시 알림이에요");
  });
});
