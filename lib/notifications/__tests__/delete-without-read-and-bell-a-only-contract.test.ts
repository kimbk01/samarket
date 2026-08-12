/**
 * DELETE WITHOUT READ + Bell A-only list contracts (C1 / C2 recovery).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyInboxEligibilityFilters,
  fillEligibleInboxRowsUntilLimit,
  type InboxNotificationRow,
} from "@/lib/notifications/inbox-events-merge";
import {
  deriveMemberUnreadNotificationCount,
  filterMemberNotificationAInboxRows,
  isMemberNotificationAUnread,
  memberNotificationAEventFromInboxRow,
} from "@/lib/notifications/badge-authority-rebuild/member-notification-a-projection";
import { resolveMemberAppIconAuthority } from "@/lib/notifications/badge-authority-rebuild/member-app-icon-authority";
import { resolveMemberNotificationAuthorityFromRows } from "@/lib/notifications/badge-authority-rebuild/member-notification-a-authority";
import { resolveMemberConversationAuthority } from "@/lib/notifications/badge-authority-rebuild/member-conversation-b-authority";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const MEMBER = "member-delete-a-only";

function aRow(id: string, extra: Partial<Parameters<typeof isMemberNotificationAUnread>[0]> = {}) {
  return {
    id,
    type: "trade_status",
    category: "trade_status",
    unread: true,
    read_at: null,
    dedupe_key: id,
    display_payload: {},
    ...extra,
  };
}

function inboxRow(
  id: string,
  partial: Partial<InboxNotificationRow> & { event_type?: string | null } = {}
): InboxNotificationRow & { event_type?: string | null } {
  return {
    id,
    notification_type: "trade_status",
    title: id,
    body: null,
    link_url: "/market",
    is_read: false,
    created_at: "2026-08-12T00:00:00.000Z",
    meta: {},
    push_kind: "system",
    ...partial,
  };
}

describe("delete-unread-does-not-mark-read", () => {
  it("dismiss helper never stamps read_at / unread / opened_at", () => {
    const bridge = read("lib/notifications/inbox-read-bridge.ts");
    const dismissStart = bridge.indexOf("async function dismissNotificationEventFromInbox");
    expect(dismissStart).toBeGreaterThan(-1);
    const contractBlock = bridge.slice(Math.max(0, dismissStart - 500), dismissStart + 1200);
    expect(contractBlock).toContain("DELETE WITHOUT READ");
    expect(contractBlock).toContain("inbox_dismissed_at");
    expect(contractBlock).toContain("deleted_at");
    const dismissFn = bridge.slice(dismissStart, dismissStart + 900);
    expect(dismissFn).not.toMatch(/read_at:\s*now/);
    expect(dismissFn).not.toMatch(/unread:\s*false/);

    const deleteStart = bridge.indexOf("export async function patchInboxNotificationIdsDelete");
    const deleteFn = bridge.slice(deleteStart, deleteStart + 900);
    expect(deleteFn).toContain("dismissNotificationEventFromInbox");
    expect(deleteFn).not.toContain("patchInboxNotificationIdsRead");
  });
});

describe("delete-unread-removes-from-a", () => {
  it("unread delete (deleted_at) drops A while read_at stays null", () => {
    const unread = aRow("a1");
    expect(isMemberNotificationAUnread(unread)).toBe(true);
    expect(deriveMemberUnreadNotificationCount([unread])).toBe(1);

    const deletedUnread = aRow("a1", {
      unread: true,
      read_at: null,
      display_payload: { deleted_at: "2026-08-12T01:00:00.000Z", inbox_dismissed_at: "2026-08-12T01:00:00.000Z" },
    });
    expect(deletedUnread.read_at).toBeNull();
    expect(isMemberNotificationAUnread(deletedUnread)).toBe(false);
    expect(deriveMemberUnreadNotificationCount([deletedUnread])).toBe(0);
  });
});

describe("delete-unread-recomputes-icon", () => {
  it("App Icon = A+B drops when unread A is dismissed without read", () => {
    const a = resolveMemberNotificationAuthorityFromRows([aRow("a1")], MEMBER);
    const b = resolveMemberConversationAuthority(MEMBER, []);
    const before = resolveMemberAppIconAuthority({
      notificationA: a,
      conversationB: b,
    });
    expect(before.appIconTotal).toBe(1);

    const aAfter = resolveMemberNotificationAuthorityFromRows(
      [
        aRow("a1", {
          display_payload: { deleted_at: "2026-08-12T01:00:00.000Z" },
        }),
      ],
      MEMBER
    );
    const after = resolveMemberAppIconAuthority({
      notificationA: aAfter,
      conversationB: b,
    });
    expect(after.appIconTotal).toBe(0);
  });
});

describe("delete-read-preserves-read-at", () => {
  it("read history delete keeps read_at and does not change A", () => {
    const read = aRow("r1", {
      unread: false,
      read_at: "2026-08-11T00:00:00.000Z",
    });
    const unread = aRow("u1");
    expect(deriveMemberUnreadNotificationCount([read, unread])).toBe(1);

    const deletedRead = {
      ...read,
      display_payload: { deleted_at: "2026-08-12T02:00:00.000Z" },
    };
    expect(deletedRead.read_at).toBe("2026-08-11T00:00:00.000Z");
    expect(deriveMemberUnreadNotificationCount([deletedRead, unread])).toBe(1);
  });
});

describe("bell-unread-list-a-only / excludes-chat / excludes-owner", () => {
  it("filters chat + owner from A list; keeps A rows", () => {
    const rows = [
      inboxRow("a1", { notification_type: "trade_status", event_type: "trade_status" }),
      inboxRow("c1", {
        notification_type: "chat",
        push_kind: "chat",
        event_type: "chat_message",
        meta: { kind: "group_chat" },
      }),
      inboxRow("o1", {
        notification_type: "commerce",
        push_kind: "delivery",
        event_type: "order_status",
        meta: { kind: "store_order_created", order_id: "ox", store_id: "s1" },
        dedupe_key: "commerce:owner:new_order:ox",
      }),
    ];
    const filtered = filterMemberNotificationAInboxRows(rows);
    expect(filtered.map((r) => r.id)).toEqual(["a1"]);
    expect(filtered.every((r) => r.notification_type !== "chat")).toBe(true);
  });
});

describe("bell-digit-equals-visible-a-total", () => {
  it("unread A digit equals filtered unread list length", () => {
    const events = [
      aRow("a1"),
      aRow("a2"),
      aRow("chat", { type: "chat_message", category: "chat", room_id: "r1" }),
      aRow("own", {
        type: "order_status",
        category: "order_status",
        display_payload: {
          legacyMeta: { kind: "store_order_created", order_id: "ox", store_id: "s1" },
        },
        dedupe_key: "commerce:owner:new_order:ox",
      }),
    ];
    const digit = deriveMemberUnreadNotificationCount(events);
    const visible = events.filter((r) => isMemberNotificationAUnread(r));
    expect(digit).toBe(2);
    expect(visible.map((r) => r.id).sort()).toEqual(["a1", "a2"]);
  });
});

describe("j8-fill-after-exclude-regression", () => {
  it("fills A after excluding chat — does not freeze latest-N chat window", () => {
    const chatBatch = Array.from({ length: 40 }, (_, i) =>
      inboxRow(`chat-${i}`, {
        notification_type: "chat",
        push_kind: "chat",
        created_at: `2026-08-12T01:00:${String(i).padStart(2, "0")}.000Z`,
      })
    );
    const aBatch = [
      inboxRow("a-deep", {
        notification_type: "admin_notice",
        event_type: "admin_notice",
        bell_presentation_type: "admin_notice",
        created_at: "2026-08-11T00:00:00.000Z",
      }),
    ];
    const filled = fillEligibleInboxRowsUntilLimit(
      [chatBatch, aBatch],
      { fetchUpper: 1, excludeChatMessageList: true, excludeOwnerList: true },
      1
    );
    expect(filled.map((r) => r.id)).toEqual(["a-deep"]);
  });
});

describe("mark-all-a-only", () => {
  it("route mark-all path stays A-only (exclude owner+chat)", () => {
    const route = read("app/api/me/notifications/route.ts");
    expect(route).toContain("mark_my_notifications_read_excluding_owner_and_chat");
    expect(route).toMatch(
      /mark_my_notifications_read_excluding_owner_and_chat[\s\S]{0,400}exclude.*chat|owner_and_chat/
    );
  });
});

describe("member-bell-list-default-a-only", () => {
  it("GET defaults exclude chat/owner unless opt-out", () => {
    const route = read("app/api/me/notifications/route.ts");
    expect(route).toContain("Member Bell SSOT (C1 recovery)");
    expect(route).toContain('excludeChatParam === "0"');
    expect(route).toContain('inboxPushKindRawEarly !== "chat"');

    const fetchSrc = read("lib/me/fetch-me-notifications-deduped.ts");
    expect(fetchSrc).toContain('sp.set("exclude_chat_message", "1")');
    expect(fetchSrc).toContain('opts?.excludeChatMessages !== false');
  });

  it("eligibility filters drop chat when excludeChatMessageList", () => {
    const rows = [
      inboxRow("a1"),
      inboxRow("c1", { notification_type: "chat", push_kind: "chat" }),
    ];
    const out = applyInboxEligibilityFilters(rows, {
      fetchUpper: 10,
      excludeChatMessageList: true,
      excludeOwnerList: true,
    });
    expect(out.map((r) => r.id)).toEqual(["a1"]);
  });

  it("inbox mapper prefers event_type so chat_message cannot become A", () => {
    const mapped = memberNotificationAEventFromInboxRow({
      id: "c1",
      notification_type: "chat",
      event_type: "chat_message",
      push_kind: "chat",
      is_read: false,
    });
    expect(mapped.type).toBe("chat_message");
    expect(isMemberNotificationAUnread(mapped)).toBe(false);
  });
});
