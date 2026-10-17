import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isMemberNotificationAListItem,
  isMemberNotificationAUnread,
} from "@/lib/notifications/badge-authority-rebuild/member-notification-a-eligibility";
import { MEMBER_NOTIFICATION_A_KINDS } from "@/lib/notifications/badge-authority-rebuild/badge-event-classifier";
import { ADMIN_RECIPIENT_NOTIFICATION_TYPES } from "@/lib/admin/notifications/admin-notification-kinds";
import { createAndDispatchNotificationEvent } from "@/lib/notifications/pipeline/notification-event-dispatcher";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

const legacyAdminRow = {
  id: "e1",
  type: "support_customer_replied",
  category: "admin_notice",
  unread: true,
  read_at: null,
  display_payload: { routeUrl: "/admin/support/cases/c1" },
};

describe("R13 — admin work notices never enter Member notifications", () => {
  it("legacy member-store rows of admin-recipient types are not Member A (bell/list/app icon)", () => {
    expect(isMemberNotificationAUnread(legacyAdminRow)).toBe(false);
    expect(isMemberNotificationAListItem(legacyAdminRow)).toBe(false);
  });

  it("member-facing support events still count (no regression)", () => {
    for (const type of ["support_admin_replied", "support_case_resolved"]) {
      const row = { ...legacyAdminRow, type, category: type === "support_admin_replied" ? "inquiry_answered" : "admin_notice" };
      expect(isMemberNotificationAUnread(row)).toBe(true);
    }
  });

  it("client Member A kinds exclude admin-recipient types", () => {
    for (const t of ADMIN_RECIPIENT_NOTIFICATION_TYPES) {
      expect(MEMBER_NOTIFICATION_A_KINDS as readonly string[]).not.toContain(t);
    }
  });

  it("member pipeline refuses to create admin-recipient events", async () => {
    const r = await createAndDispatchNotificationEvent({} as never, {
      userId: "u1",
      type: "support_customer_replied",
      category: "admin_notice",
      title: "x",
      body: "y",
    } as never);
    expect(r).toEqual({ ok: false, error: "admin_recipient_type_forbidden" });
  });

  it("inbox list and member push dispatcher exclude admin-recipient types", () => {
    expect(read("lib/notifications/inbox-events-merge.ts")).toContain("...ADMIN_RECIPIENT_NOTIFICATION_TYPES");
    expect(read("lib/notifications/pipeline/notify-push-dispatcher.ts")).toMatch(
      /isAdminRecipientNotificationType\(row\.type\)[\s\S]{0,200}admin_recipient_type/
    );
  });
});
