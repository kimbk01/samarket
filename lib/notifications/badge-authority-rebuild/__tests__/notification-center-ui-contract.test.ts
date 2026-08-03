/**
 * Gate 3 Step 8 — Notification Center UI contract (CODE).
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  gate2ASetsEqual,
  snapshotAuthorityASets,
} from "@/lib/notifications/badge-authority-rebuild/authority-a-set-heads";
import { resolveMemberNotificationAuthorityFromRows } from "@/lib/notifications/badge-authority-rebuild/member-notification-a-authority";
import { filterMemberNotificationAInboxRows } from "@/lib/notifications/badge-authority-rebuild/member-notification-a-projection";
import { isMemberNotificationAUnread } from "@/lib/notifications/badge-authority-rebuild/member-notification-a-eligibility";

const root = process.cwd();

describe("Gate3 Step8 Notification Center UI contract", () => {
  it("Bell click opens inbox modal; see-all goes to /notifications", () => {
    const src = fs.readFileSync(
      path.join(root, "components/philife/PhilifeHeaderNotificationInbox.tsx"),
      "utf8"
    );
    expect(src.includes("setOpen((v) => !v)")).toBe(true);
    expect(src.includes('href="/notifications"')).toBe(true);
    expect(src.includes('href="/mypage/notifications#notification-inbox"')).toBe(false);
  });

  it("Notification Center excludes write FAB and mounts OwnerLite inside sticky safe-top", () => {
    const flags = fs.readFileSync(
      path.join(root, "lib/layout/conditional-app-shell-flags.ts"),
      "utf8"
    );
    expect(flags.includes("isNotificationsCenterPathname")).toBe(true);
    expect(flags.includes("!isNotificationsCenter")).toBe(true);
    expect(flags.includes("showOwnerLiteStoreBarInNotificationsSticky")).toBe(true);
    const sticky = fs.readFileSync(
      path.join(root, "components/layout/AppStickyHeader.tsx"),
      "utf8"
    );
    expect(sticky.includes("showOwnerLiteInNotificationsSticky")).toBe(true);
    expect(sticky.includes("OwnerLiteStoreBarLazy")).toBe(true);
  });

  it("Notification Center page supports selection mode for read/delete", () => {
    const page = fs.readFileSync(
      path.join(root, "app/(main)/notifications/page.tsx"),
      "utf8"
    );
    expect(page.includes("selectionMode")).toBe(true);
    expect(page.includes("notif_center_select")).toBe(true);
    const list = fs.readFileSync(
      path.join(root, "components/notifications/InboxGroupCardList.tsx"),
      "utf8"
    );
    expect(list.includes("selectionMode")).toBe(true);
    expect(list.includes("onToggleSelect")).toBe(true);
  });

  it("Notification Center page exists and uses MyNotificationsView A filter", () => {
    const page = fs.readFileSync(
      path.join(root, "app/(main)/notifications/page.tsx"),
      "utf8"
    );
    expect(page.includes("MyNotificationsView")).toBe(true);
    expect(page.includes('variant="notification_center"')).toBe(true);
    const view = fs.readFileSync(
      path.join(root, "components/my/MyNotificationsView.tsx"),
      "utf8"
    );
    expect(view.includes("filterMemberNotificationAInboxRows")).toBe(true);
    expect(view.includes('"chat"')).toBe(false);
  });

  it("base set uses canonical A — chat/owner/push-only excluded; announcement included", () => {
    const inbox = [
      {
        id: "a1",
        notification_type: "admin_notice",
        is_read: false,
        meta: {},
        dedupe_key: "n1",
      },
      {
        id: "chat1",
        notification_type: "chat",
        is_read: false,
        meta: {},
        room_id: "r1",
      },
      {
        id: "own1",
        notification_type: "order_status",
        is_read: false,
        meta: { kind: "store_order_created", order_id: "ox", store_id: "s1" },
        dedupe_key: "commerce:owner:new_order:ox",
      },
      {
        id: "mk",
        notification_type: "admin_marketing_banner",
        is_read: false,
        meta: {},
      },
    ];
    const filtered = filterMemberNotificationAInboxRows(inbox);
    expect(filtered.map((r) => r.id)).toEqual(["a1"]);
  });

  it("all-read targets exactly canonical unread A IDs", () => {
    const rows = [
      {
        id: "u1",
        type: "admin_notice",
        category: "admin_notice",
        unread: true,
        read_at: null,
        dedupe_key: "a",
        display_payload: {},
      },
      {
        id: "u2",
        type: "trade_status",
        category: "trade_status",
        unread: true,
        read_at: null,
        dedupe_key: "t",
        display_payload: { legacyMeta: { product_id: "p" } },
      },
      {
        id: "chat",
        type: "chat_message",
        category: "chat",
        unread: true,
        read_at: null,
        room_id: "r",
        dedupe_key: "c",
        display_payload: {},
      },
    ];
    const auth = resolveMemberNotificationAuthorityFromRows(rows, "m1");
    expect(auth.eventIds).toEqual(["u1", "u2"]);
    expect(gate2ASetsEqual(snapshotAuthorityASets(rows, "m1"))).toBe(true);
  });

  it("unread delete decrements A once; read delete does not", () => {
    const unread = {
      id: "u1",
      type: "admin_notice" as const,
      category: "admin_notice",
      unread: true,
      read_at: null,
      dedupe_key: "a",
      display_payload: {},
    };
    const read = {
      ...unread,
      id: "r1",
      dedupe_key: "b",
      unread: false,
      read_at: "2026-01-01T00:00:00.000Z",
    };
    expect(resolveMemberNotificationAuthorityFromRows([unread, read], "m1").unreadCount).toBe(1);
    const afterUnreadDelete = resolveMemberNotificationAuthorityFromRows(
      [
        {
          ...unread,
          display_payload: { deleted_at: "2026-01-02T00:00:00.000Z" },
        },
        read,
      ],
      "m1"
    );
    expect(afterUnreadDelete.unreadCount).toBe(0);
    const afterReadDelete = resolveMemberNotificationAuthorityFromRows(
      [
        unread,
        {
          ...read,
          display_payload: { deleted_at: "2026-01-02T00:00:00.000Z" },
        },
      ],
      "m1"
    );
    expect(afterReadDelete.unreadCount).toBe(1);
    expect(isMemberNotificationAUnread(unread)).toBe(true);
  });

  it("mark-all / delete API use member A paths; Bell popup has no independent digit invent", () => {
    const route = fs.readFileSync(
      path.join(root, "app/api/me/notifications/route.ts"),
      "utf8"
    );
    expect(route.includes("markMemberANotificationsAllRead")).toBe(true);
    expect(route.includes("dismissMemberNotificationCenterEvents")).toBe(true);
    const sync = fs.readFileSync(
      path.join(root, "lib/notifications/tier1-header-inbox-sync.ts"),
      "utf8"
    );
    expect(sync.includes("supplementalUnreadCount")).toBe(true);
    expect(sync.includes("void opts.supplementalUnreadCount")).toBe(true);
  });

  it("MyNotificationsView reconciles badges after mark-all and delete", () => {
    const view = fs.readFileSync(
      path.join(root, "components/my/MyNotificationsView.tsx"),
      "utf8"
    );
    expect(view.includes("resyncBadgesAfterNotificationEventsRead")).toBe(true);
    expect(view.includes("mark_my_notifications_read_excluding_owner_and_chat")).toBe(
      true
    );
  });

  it("detail route exists", () => {
    expect(
      fs.existsSync(path.join(root, "app/(main)/notifications/[notificationId]/page.tsx"))
    ).toBe(true);
  });

  it("mutation failure does not remove rows; success path reconciles A (no local digit invent)", () => {
    const view = fs.readFileSync(
      path.join(root, "components/my/MyNotificationsView.tsx"),
      "utf8"
    );
    // Delete: filter rows only after ok; no Bell digit -= 1 local invent.
    expect(view.includes("if (!res.ok || !j?.ok)")).toBe(true);
    expect(view.includes("prev.filter((r) => !item.ids.includes(r.id))")).toBe(true);
    expect(view.includes("resyncBadgesAfterNotificationEventsRead")).toBe(true);
    expect(view.includes("bellDigit")).toBe(false);
    expect(view.includes("setBadgeCount(")).toBe(false);
  });

  it("delete-all targets current member A list items via soft dismiss bridge", () => {
    const bridge = fs.readFileSync(
      path.join(root, "lib/notifications/inbox-read-bridge.ts"),
      "utf8"
    );
    expect(bridge.includes("isMemberNotificationAListItem")).toBe(true);
    expect(bridge.includes('mode: "all" | "read_only"')).toBe(true);
    expect(bridge.includes("dismissNotificationEventFromInbox")).toBe(true);
  });
});
