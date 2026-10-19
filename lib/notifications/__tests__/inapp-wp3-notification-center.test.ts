/**
 * WP3 — 알림센터 library contracts.
 * INAPP-01 unread styling · INAPP-02 server category filter / pagination / category mark-all ·
 * INAPP-04 origin-unavailable notice · INAPP-12 Korean a11y.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  fetchNotificationEventsForInbox,
  selectMemberAUnreadIdsInDomain,
} from "@/lib/notifications/inbox-events-merge";
import { markMemberANotificationsAllRead } from "@/lib/notifications/inbox-read-bridge";
import { parseMemberNotificationDomainParam } from "@/lib/notifications/member-notification-domain";
import {
  INBOX_ROW_READ_BG,
  INBOX_ROW_UNREAD_BG,
  resolveInboxRowReadState,
} from "@/lib/notifications/inbox-row-read-state";
import { buildNotificationsListUrl } from "@/lib/me/fetch-me-notifications-deduped";
import { myMessages } from "@/lib/i18n/catalog/my";

vi.mock("@/lib/notifications/pipeline/notify-badge-service", () => ({
  invalidateNotificationBadgeCache: vi.fn(),
}));
vi.mock("@/lib/notifications/notification-unread-count-cache", () => ({
  invalidateNotificationUnreadCountCache: vi.fn(),
}));

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

function ev(id: string, type: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    type,
    category: type,
    title: `t-${id}`,
    body: "",
    display_payload: {},
    read_at: null,
    created_at: `2026-10-01T00:00:${String(99 - Number(id.replace(/\D/g, "") || 0)).padStart(2, "0")}.000Z`,
    dedupe_key: `d-${id}`,
    room_id: null,
    ...extra,
  };
}

/** Fake notification_events reader honoring .range() windows. */
function rangeClient(rows: Record<string, unknown>[]) {
  const ranges: [number, number][] = [];
  const q = {
    select: () => q,
    eq: () => q,
    order: () => q,
    range: async (from: number, to: number) => {
      ranges.push([from, to]);
      return { data: rows.slice(from, to + 1), error: null };
    },
  };
  return { sb: { from: () => q } as never, ranges };
}

describe("INAPP-02 server category filter + pagination", () => {
  it("list URL carries the category tab as push_kind with limit/offset", () => {
    const url = buildNotificationsListUrl({
      pushKind: "trade",
      limit: 40,
      offset: 40,
      excludeChatMessages: true,
      excludeOwnerStoreCommerce: true,
    });
    const sp = new URL(url, "http://x").searchParams;
    expect(sp.get("push_kind")).toBe("trade");
    expect(sp.get("limit")).toBe("40");
    expect(sp.get("offset")).toBe("40");
    expect(sp.get("exclude_chat_message")).toBe("1");
    expect(new URL(buildNotificationsListUrl({ pushKind: "all" }), "http://x").searchParams.has("push_kind")).toBe(
      false
    );
  });

  it("server filters by category before the page window (no category rows dropped by paging)", async () => {
    // 90 notice rows interleaved with 10 trade rows → trade rows sit far past a raw first page.
    const rows: Record<string, unknown>[] = [];
    for (let i = 0; i < 100; i++) {
      rows.push(
        i % 10 === 9
          ? ev(`r${i}`, "trade_status", { display_payload: { legacyMeta: { product_id: `p${i}` } } })
          : ev(`r${i}`, "admin_notice", { display_payload: { campaignType: "notice" } })
      );
    }
    const { sb } = rangeClient(rows);
    const trade = await fetchNotificationEventsForInbox(sb, "u1", {
      fetchUpper: 11,
      inboxPushKind: "trade",
      excludeOwnerList: true,
      excludeChatMessageList: true,
    });
    expect(trade.map((r) => r.id)).toEqual(rows.filter((_, i) => i % 10 === 9).map((r) => r.id));
    // Route pages eligible rows: offset 5, limit 3 (+1 has_more probe).
    const page2 = trade.slice(5, 5 + 3 + 1);
    expect(page2.map((r) => r.id)).toEqual(["r59", "r69", "r79", "r89"]);
  });

  it("route wires push_kind into the server loader and pages eligible rows", () => {
    const route = read("app/api/me/notifications/route.ts");
    expect(route).toContain("inboxPushKind");
    expect(route).toContain("notifications.slice(listOffset, listOffset + displayCap + 1)");
    expect(route).toContain("has_more: hasMore");
  });

  it("Notification Center requests the active category from the server", () => {
    const view = read("components/my/MyNotificationsView.tsx");
    expect(view).toContain("pushKind: categoryFilter");
    expect(view).not.toContain('pushKind: "all",\n          limit');
    // 더보기 offset = server rows consumed, not client-filtered row count.
    expect(view).toContain("serverOffsetRef.current");
    expect(view).not.toContain("void load(true, false, true, rows.length)");
  });

  it("category param parser: all/empty → null, domains pass, others invalid", () => {
    expect(parseMemberNotificationDomainParam(undefined)).toBeNull();
    expect(parseMemberNotificationDomainParam("all")).toBeNull();
    expect(parseMemberNotificationDomainParam(" Trade ")).toBe("trade");
    expect(parseMemberNotificationDomainParam("system")).toBe("system");
    expect(parseMemberNotificationDomainParam("chat")).toBe("invalid");
    expect(parseMemberNotificationDomainParam("store")).toBe("invalid");
  });
});

describe("INAPP-02 모두 읽음 — server, optionally per category", () => {
  it("narrows canonical unread ids to one domain with the list classifier", () => {
    const rows = [
      ev("n1", "admin_notice", { display_payload: { campaignType: "notice" } }),
      ev("t1", "trade_status", { display_payload: { legacyMeta: { product_id: "p" } } }),
      ev("m1", "admin_notice", { display_payload: { campaignType: "marketing" } }),
      ev("t2", "trade_status", { display_payload: { legacyMeta: { product_id: "q" } } }),
    ];
    const canonical = ["n1", "t1", "m1"]; // t2 not canonical A → never marked
    expect(selectMemberAUnreadIdsInDomain(rows, canonical, "trade")).toEqual(["t1"]);
    expect(selectMemberAUnreadIdsInDomain(rows, canonical, "notice")).toEqual(["n1"]);
    expect(selectMemberAUnreadIdsInDomain(rows, canonical, "marketing")).toEqual(["m1"]);
  });

  it("passes the category scope to the canonical marker only when set", async () => {
    const markEvents = vi.fn().mockResolvedValue(2);
    const sb = { from: vi.fn() };
    await markMemberANotificationsAllRead(sb as never, "u1", { markEvents, domain: "trade" });
    expect(markEvents).toHaveBeenLastCalledWith(sb, "u1", { domain: "trade" });
    await markMemberANotificationsAllRead(sb as never, "u1", { markEvents, domain: null });
    expect(markEvents).toHaveBeenLastCalledWith(sb, "u1");
  });

  it("view sends category + keeps badge refresh hooks after mark-all", () => {
    const view = read("components/my/MyNotificationsView.tsx");
    expect(view).toContain("mark_my_notifications_read_excluding_owner_and_chat: true");
    expect(view).toContain('categoryFilter !== "all" ? { category: categoryFilter } : {}');
    const markAll = view.slice(view.indexOf("const markAllRead = useCallback"));
    expect(markAll).toContain("invalidateMeNotificationsListDedupedCache()");
    expect(markAll).toContain("broadcastNotificationsUpdated()");
    expect(markAll).toContain('resyncBadgesAfterNotificationEventsRead("notification_opened")');
    // Enabled by server unread count, not only loaded rows.
    expect(view).toContain("(tabCounts[categoryFilter] ?? 0) > 0");
  });
});

describe("INAPP-01 unread styling contract", () => {
  it("unread: tint + dot + bold title; read: plain surface, no dot, normal weight", () => {
    const unread = resolveInboxRowReadState(2);
    expect(unread.unread).toBe(true);
    expect(unread.rowClassName).toBe(INBOX_ROW_UNREAD_BG);
    expect(unread.showUnreadDot).toBe(true);
    expect(unread.titleClassName).toContain("font-bold");

    const readRow = resolveInboxRowReadState(0);
    expect(readRow.unread).toBe(false);
    expect(readRow.rowClassName).toBe(INBOX_ROW_READ_BG);
    expect(readRow.showUnreadDot).toBe(false);
    expect(readRow.titleClassName).toContain("font-normal");
    expect(readRow.titleClassName).not.toContain("font-bold");
    expect(unread.rowClassName).not.toBe(readRow.rowClassName);
  });

  it("uses sam tokens only (no hex)", () => {
    const s = resolveInboxRowReadState(1);
    for (const cls of [s.rowClassName, s.titleClassName, s.dotClassName, INBOX_ROW_READ_BG]) {
      expect(cls).toMatch(/sam-/);
      expect(cls).not.toMatch(/#[0-9a-f]{3,6}/i);
    }
  });

  it("row list renders read state from the contract", () => {
    const list = read("components/notifications/InboxGroupCardList.tsx");
    expect(list).toContain("resolveInboxRowReadState(item.unreadCount)");
    expect(list).toContain("readState.titleClassName");
    expect(list).toContain("readState.showUnreadDot");
    expect(list).toContain("notif_row_unread_sr");
    expect(list).not.toContain("text-[14px] font-bold leading-snug text-sam-fg line-clamp-1");
  });
});

describe("INAPP-03/04 detail + origin unavailable", () => {
  it("detail loads by id via single-item API (not the first-100 list)", () => {
    const detail = read("app/(main)/notifications/[notificationId]/page.tsx");
    expect(detail).toContain("fetchMeNotificationById(notificationId)");
    expect(detail).not.toContain("limit: 100");
    expect(detail).toContain("NotificationContentUnavailableNotice");
    expect(detail).toContain("openDestination(externalUrl, router)");
  });

  it("list shows the standard notice for ?fallback=origin_unavailable and unresolvable taps", () => {
    const view = read("components/my/MyNotificationsView.tsx");
    expect(view).toContain('searchParams?.get("fallback") === "origin_unavailable"');
    expect(view).toContain('.kind === "inbox_fallback"');
    expect(view).toContain("NotificationContentUnavailableNotice");
    expect(myMessages.ko.notif_content_unavailable_notice).toBe("삭제되었거나 볼 수 없는 콘텐츠입니다");
  });
});

describe("INAPP-12 Korean accessible names", () => {
  it("tab bar uses Korean i18n labels, not the English literal", () => {
    const bar = read("components/notifications/NotificationInboxTabBar.tsx");
    expect(bar).not.toContain('aria-label="notification tabs"');
    expect(bar).toContain('t("notif_center_tabs_aria")');
    expect(bar).toContain("notif_center_tab_unread_aria");
    expect(myMessages.ko.notif_center_tabs_aria).toBe("알림 분류");
    expect(myMessages.ko.notif_center_tab_unread_aria).toContain("읽지 않은 알림");
  });
});
