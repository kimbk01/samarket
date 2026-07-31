import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveDomainAppIconBadgeCount } from "@/lib/notifications/domain-app-icon-badge";

const read = (path: string) =>
  readFileSync(join(process.cwd(), path), "utf8");

describe("notification badge and inbox authority", () => {
  it("keeps App Icon on domain rooms plus orphan missed calls", () => {
    expect(
      resolveDomainAppIconBadgeCount({
        messenger: 2,
        trade: 3,
        storeOrder: 4,
        missedCall: 1,
      })
    ).toBe(10);
    const docs = read("docs/dibay-notification-badge-number-policy.md");
    expect(docs).toContain(
      "unread `general_direct/group` room + `trade` room + `store_order` room"
    );
    expect(docs).toContain(
      "status event SUM"
    );
  });

  it("keeps the measured Production legacy reader as compatibility-only", () => {
    const route = read("app/api/me/notifications/route.ts");
    expect(route).toContain("eventRowsPromise");
    expect(route).toContain("mergeInboxNotificationRowsEventsPrimary");
    expect(route).toContain("legacy_reader_degraded");
  });

  it("excludes call signals and admin tests from inbox presentation", () => {
    const merge = read("lib/notifications/inbox-events-merge.ts");
    expect(merge).toMatch(
      /INBOX_EXCLUDED_EVENT_TYPES[\s\S]*"incoming_call_signal"[\s\S]*"admin_test"/
    );
  });

  it("processes event IDs before legacy compatibility IDs on read", () => {
    const bridge = read("lib/notifications/inbox-read-bridge.ts");
    const eventRead = bridge.indexOf(
      "const eventRows = rows.filter",
      bridge.indexOf("patchInboxNotificationIdsRead")
    );
    const legacyRead = bridge.indexOf(
      "if (legacyIds.length > 0)",
      eventRead
    );
    expect(eventRead).toBeGreaterThan(-1);
    expect(legacyRead).toBeGreaterThan(eventRead);
  });
});
