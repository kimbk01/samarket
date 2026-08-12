import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveDomainAppIconBadgeCount } from "@/lib/notifications/domain-app-icon-badge";

const read = (path: string) =>
  readFileSync(join(process.cwd(), path), "utf8");

describe("notification badge and inbox authority", () => {
  it("keeps App Icon on chat rooms plus NotificationAttention (missedCall wire = notification axis)", () => {
    expect(
      resolveDomainAppIconBadgeCount({
        messenger: 2,
        trade: 3,
        storeOrder: 4,
        missedCall: 1,
      })
    ).toBe(10);
  });

  it("product Bell list uses notification_events only (no legacy unread merge)", () => {
    const route = read("app/api/me/notifications/route.ts");
    expect(route).toContain('authority: "notification_events"');
    expect(route).toContain("legacy_merge: false");
    expect(route).toContain("loadMemberNotificationAUnreadCount");
    expect(route).toContain("unread_total");
    expect(route).not.toContain("mergeInboxNotificationRowsEventsPrimary");
    expect(route).not.toContain("legacy_reader_degraded");
  });

  it("excludes call signals and admin tests from inbox presentation", () => {
    const merge = read("lib/notifications/inbox-events-merge.ts");
    expect(merge).toMatch(
      /INBOX_EXCLUDED_EVENT_TYPES[\s\S]*"incoming_call_signal"[\s\S]*"admin_test"/
    );
  });

  it("reads mark event IDs on canonical path; legacy notifications write forbidden", () => {
    const bridge = read("lib/notifications/inbox-read-bridge.ts");
    const fnStart = bridge.indexOf("export async function patchInboxNotificationIdsRead");
    expect(fnStart).toBeGreaterThan(-1);
    const fnBody = bridge.slice(fnStart, fnStart + 2800);
    const eventRead = fnBody.indexOf("const eventRows = rows.filter");
    expect(eventRead).toBeGreaterThan(-1);
    // Gate 3 Step 10 — partition may still see legacy ids for lookup, but must not UPDATE them.
    expect(fnBody).toContain("void legacyIds");
    expect(fnBody).toMatch(/Canonical-only write|Legacy `notifications` update FORBIDDEN/);
    expect(fnBody).not.toMatch(
      /if\s*\(\s*legacyIds\.length\s*>\s*0\s*\)[\s\S]*?\.from\(\s*["']notifications["']\s*\)/
    );
  });
});
