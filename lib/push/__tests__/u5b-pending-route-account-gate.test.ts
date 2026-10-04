/**
 * U5-b — CTA-05: held push routes record the recipient; every replay path rejects a
 * proven account mismatch. Unrecorded routes keep the existing replay (no regression
 * for Android route events that carry no recipient id).
 */
// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isPendingPushRouteAccountMismatch,
  readPendingPushRoute,
  writePendingPushRoute,
} from "@/lib/push/pending-push-route";

describe("isPendingPushRouteAccountMismatch", () => {
  it.each([
    [{ recipientUserId: "u1" }, "u2", true],
    [{ recipientUserId: "u1" }, "u1", false],
    [{ recipientUserId: " u1 " }, "u1", false],
    [{ recipientUserId: "u1" }, null, false],
    [{ recipientUserId: null }, "u2", false],
    [null, "u2", false],
  ])("%j vs %s → %s", (pending, bound, expected) => {
    expect(isPendingPushRouteAccountMismatch(pending, bound)).toBe(expected);
  });
});

describe("recipient persists through storage", () => {
  beforeEach(() => sessionStorage.clear());
  it("write → read keeps recipientUserId", () => {
    writePendingPushRoute({ path: "/orders?expand=o1", at: Date.now(), source: "auth_resolution_hold", recipientUserId: "u1" });
    expect(readPendingPushRoute()?.recipientUserId).toBe("u1");
  });
});

describe("PushRouteListener wiring", () => {
  const src = readFileSync(join(process.cwd(), "components/push/PushRouteListener.tsx"), "utf8");
  it("hold and login writes record the recipient", () => {
    expect(src.match(/recipientUserId: holdRecipientUserId/g)?.length).toBe(2);
  });
  it("mount/visibility replay applies the account gate before navigating", () => {
    const i = src.indexOf("const consumePendingRoutes");
    const block = src.slice(i, i + 900);
    expect(block).toContain("isPendingPushRouteAccountMismatch(sessionPending");
    expect(block.indexOf("isPendingPushRouteAccountMismatch")).toBeLessThan(block.indexOf("navigate(sessionPending.path"));
  });
  it("capacitor tap passes payload recipient into navigate", () => {
    expect(src).toContain("{ recipientUserId: resolvePushPayloadRecipientUserId(data) }");
  });
});
