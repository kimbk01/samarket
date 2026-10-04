/**
 * U5-a — CTA-07: notification detail auto-forward must `replace` (Back must not
 * re-enter detail and forward again). List taps keep the default `push`.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  activateNotificationDestination,
  pushNotificationDestination,
} from "@/lib/notifications/navigate-notification-destination";

const resolveInput = {
  inboxRow: { id: "n1", notification_type: "commerce", link_url: "/orders?expand=o1", meta: null },
  fallbackHref: "/notifications",
} as never;

describe("CTA-07 navigation mode", () => {
  it("default is push (list taps unchanged)", () => {
    const router = { push: vi.fn(), replace: vi.fn() };
    activateNotificationDestination({ router, resolveInput });
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.push.mock.calls[0]![0]).toContain("/orders");
  });

  it("replace mode uses router.replace", () => {
    const router = { push: vi.fn(), replace: vi.fn() };
    activateNotificationDestination({ router, resolveInput, navigationMode: "replace" });
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.push).not.toHaveBeenCalled();
  });

  it("replace falls back to push when router has no replace", () => {
    const router = { push: vi.fn() };
    pushNotificationDestination(router, "/orders", "replace");
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it("detail page auto-forward passes replace", () => {
    const src = readFileSync(join(process.cwd(), "app/(main)/notifications/[notificationId]/page.tsx"), "utf8");
    expect(src).toContain('navigationMode: "replace"');
  });
});
