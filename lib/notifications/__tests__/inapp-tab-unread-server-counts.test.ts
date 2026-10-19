import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { fetchNotificationEventsForInbox } from "@/lib/notifications/inbox-events-merge";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("INAPP-02 — per-tab unread digits are computed on the server over every unread row", () => {
  it("unreadOnly scans read_at IS NULL rows only", async () => {
    const is = vi.fn();
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.is = (...args: unknown[]) => (is(...args), chain);
    chain.order = () => chain;
    chain.range = async () => ({ data: [], error: null });
    const sb = { from: () => chain };
    await fetchNotificationEventsForInbox(sb as never, "u1", { fetchUpper: 10, unreadOnly: true });
    expect(is).toHaveBeenCalledWith("read_at", null);
    is.mockClear();
    await fetchNotificationEventsForInbox(sb as never, "u1", { fetchUpper: 10 });
    expect(is).not.toHaveBeenCalled();
  });

  it("route answers ?tab_unread_counts=1 with classifier counts + canonical A total", () => {
    const route = read("app/api/me/notifications/route.ts");
    expect(route).toContain('searchParams.get("tab_unread_counts") === "1"');
    expect(route).toMatch(/fetchUpper: INBOX_ELIGIBLE_FILL_SCAN_MAX,[\s\S]*?unreadOnly: true/);
    expect(route).toContain("buildNotificationCenterTabUnreadCounts({");
    expect(route).toContain("all: allUnread, unread: allUnread");
  });

  it("notification center uses the server counts instead of the first loaded page", () => {
    const view = read("components/my/MyNotificationsView.tsx");
    expect(view).toContain('fetch("/api/me/notifications?tab_unread_counts=1"');
    expect(view).not.toContain("buildNotificationCenterTabUnreadCounts({ memberRows })");
  });
});
