/**
 * U6 — NOTIF-01: list DB failure with nothing loaded → 503 ok:false (not ok:true []).
 * NOTIF-04: mark-all DB failure → ok:false (route maps to 500), not ok:true updated:0.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  fetchNotificationEventsForInbox,
  NotificationInboxLoadError,
} from "@/lib/notifications/inbox-events-merge";
import { markMemberANotificationsAllRead } from "@/lib/notifications/inbox-read-bridge";

function sbWithPages(pages: Array<{ data: unknown[] | null; error: { message: string } | null }>) {
  let call = 0;
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.order = () => chain;
  chain.range = async () => pages[Math.min(call++, pages.length - 1)];
  return { from: () => chain } as never;
}

const opts = { fetchUpper: 80 } as never;

describe("NOTIF-01 inbox load", () => {
  it("DB error with nothing loaded → NotificationInboxLoadError", async () => {
    const sb = sbWithPages([{ data: null, error: { message: "timeout" } }]);
    await expect(fetchNotificationEventsForInbox(sb, "u1", opts)).rejects.toBeInstanceOf(NotificationInboxLoadError);
  });

  it("missing table keeps legacy empty result", async () => {
    const sb = sbWithPages([{ data: null, error: { message: 'relation "notification_events" does not exist' } }]);
    await expect(fetchNotificationEventsForInbox(sb, "u1", opts)).resolves.toEqual([]);
  });

  it("genuinely empty inbox stays ok (empty array)", async () => {
    const sb = sbWithPages([{ data: [], error: null }]);
    await expect(fetchNotificationEventsForInbox(sb, "u1", opts)).resolves.toEqual([]);
  });

  it("route maps the load error to 503 load_failed", () => {
    const src = readFileSync(join(process.cwd(), "app/api/me/notifications/route.ts"), "utf8");
    expect(src).toContain("e instanceof NotificationInboxLoadError");
    expect(src).toContain('{ ok: false, error: "load_failed" }, { status: 503 }');
  });
});

describe("NOTIF-04 mark-all", () => {
  it("mark failure → ok:false mark_all_failed", async () => {
    const r = await markMemberANotificationsAllRead({} as never, "u1", {
      markEvents: async () => {
        throw new Error("db");
      },
    });
    expect(r).toEqual({ ok: false, error: "mark_all_failed" });
  });

  it("success unchanged", async () => {
    const r = await markMemberANotificationsAllRead({} as never, "u1", { markEvents: async () => 3 });
    expect(r).toEqual({ legacyUpdated: 0, eventUpdated: 3, updated: 3 });
  });

  it("canonical marker throws on update error instead of returning 0", () => {
    const src = readFileSync(join(process.cwd(), "lib/notifications/inbox-read-bridge.ts"), "utf8");
    expect(src).not.toContain("if (uErr) return 0;");
    expect(src).toContain("if (uErr) throw new Error(");
  });
});
