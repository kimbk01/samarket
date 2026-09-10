import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isCanonicalHomeListRoomSummaryPayload } from "@/lib/community-messenger/realtime/home-list-room-insert-contract";

describe("home-list room insert broadcast contract", () => {
  it("rejects non-canonical payloads", () => {
    expect(isCanonicalHomeListRoomSummaryPayload(null)).toBe(false);
    expect(isCanonicalHomeListRoomSummaryPayload({ id: "x" })).toBe(false);
    expect(
      isCanonicalHomeListRoomSummaryPayload({
        id: "r1",
        roomType: "private_group",
        title: "G",
        lastMessageAt: "2026-09-10T00:00:00.000Z",
      })
    ).toBe(true);
  });

  it("invite/create publish invitee user-channel INSERT (no first-paint home-summary)", () => {
    const svc = readFileSync(join(process.cwd(), "lib/community-messenger/group/group-room-service.ts"), "utf8");
    expect(svc).toContain("publishHomeListRoomInsertForInviteesBestEffort");
    expect(svc).toContain("home-list-room-insert-broadcast-server");
    // Avoid embedding a contiguous `@/lib/.../home-list-room-insert-broadcast` literal
    // (verify:deploy-imports scans source strings as import paths).
    const mixedModulePath = ["@", "/lib/community-messenger/realtime/home-list-room-insert-broadcast"].join("");
    expect(svc).not.toContain(`from "${mixedModulePath}"`);
    expect(svc).not.toContain(`from '${mixedModulePath}'`);
    expect(svc).toContain("ROOM_SUMMARY_UNAVAILABLE");
    const home = readFileSync(
      join(process.cwd(), "components/community-messenger/CommunityMessengerHome.tsx"),
      "utf8"
    );
    expect(home).not.toMatch(/createPrivateGroup[\s\S]{0,800}home-summary/);
    expect(home).toContain("json.roomId && json.room");
  });

  it("client subscribe module does not import service or server publish", () => {
    const client = readFileSync(
      join(process.cwd(), "lib/community-messenger/realtime/home-list-room-insert-broadcast-client.ts"),
      "utf8"
    );
    expect(client).not.toMatch(/from ["']@\/lib\/community-messenger\/service["']/);
    expect(client).not.toMatch(/import\(["']@\/lib\/community-messenger\/service["']\)/);
    expect(client).not.toMatch(/from ["'][^"']*home-list-room-insert-broadcast-server["']/);
    expect(client).not.toMatch(/from ["']next\/server["']/);
    expect(client).toContain("home-list-room-insert-contract");
    const host = readFileSync(
      join(process.cwd(), "lib/community-messenger/home/CommunityMessengerBootstrapCacheSyncHost.tsx"),
      "utf8"
    );
    expect(host).toContain("home-list-room-insert-broadcast-client");
    expect(host).not.toContain("home-list-room-insert-broadcast-server");
  });
});
