import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { resolveEventInboxLinkUrl } from "@/lib/notifications/inbox-events-merge";

describe("Phase 4 slice1 Bell point deep link", () => {
  it("notify-user-points uses /mypage/points link_url", () => {
    const src = readFileSync(
      resolve(process.cwd(), "lib/notifications/notify-user-points.ts"),
      "utf8"
    );
    const links = src.match(/link_url:\s*"[^"]+"/g) ?? [];
    expect(links.length).toBeGreaterThanOrEqual(3);
    expect(links.every((l) => l.includes("/mypage/points"))).toBe(true);
  });

  it("Bell resolves routeUrl /mypage/points for charge events", () => {
    const href = resolveEventInboxLinkUrl({
      id: "e1",
      user_id: "u1",
      type: "commerce",
      category: "commerce",
      title: "t",
      body: "b",
      unread: true,
      created_at: new Date().toISOString(),
      display_payload: {
        routeUrl: "/mypage/points",
        kind: "user_point_charge_approved",
      },
    } as never);
    expect(href).toBe("/mypage/points");
  });
});
