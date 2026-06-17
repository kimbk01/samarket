import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(process.cwd());

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

describe("trade chat block SSOT contract", () => {
  it("room block route uses blockUserSocial not user_blocks insert", () => {
    const src = read("app/api/chat/rooms/[roomId]/block/route.ts");
    expect(src).toContain("blockUserSocial");
    expect(src).not.toContain('from("user_blocks")');
  });

  it("room unblock route uses unblockUserSocial", () => {
    const src = read("app/api/chat/rooms/[roomId]/unblock/route.ts");
    expect(src).toContain("unblockUserSocial");
    expect(src).not.toContain('from("user_blocks")');
  });

  it("trade message POST uses isBlockedEitherWay", () => {
    const src = read("app/api/chat/rooms/[roomId]/messages/route.ts");
    expect(src).toContain("isBlockedEitherWay");
    expect(src).not.toContain('from("user_blocks")');
  });

  it("item trade start uses isBlockedEitherWay", () => {
    const src = read("lib/trade/item-trade-chat-start-core.ts");
    expect(src).toContain("isBlockedEitherWay");
    expect(src).not.toContain('from("user_blocks")');
  });

  it("blockUserDaangn does not insert user_blocks client-side", () => {
    const src = read("lib/reports/blockUserDaangn.ts");
    expect(src).not.toContain('from("user_blocks")');
    expect(src).toContain("/api/community/block-relations");
  });
});

describe("like block policy contract", () => {
  it("post like route checks isBlockedEitherWay", () => {
    const src = read("app/api/community/posts/[postId]/like/route.ts");
    expect(src).toContain("isBlockedEitherWay");
    expect(src).toContain("community_like_blocked_relation");
  });

  it("comment like server checks isBlockedEitherWay", () => {
    const src = read("lib/community/comment-mutations.server.ts");
    expect(src).toContain("isBlockedEitherWay");
    expect(src).toContain("community_like_blocked_relation");
  });
});

describe("bumpNotificationTarget actor gate", () => {
  it("bumpNotificationTarget supports actorUserId block gate", () => {
    const src = read("lib/notifications/notification-targets.ts");
    expect(src).toContain("actorUserId");
    expect(src).toContain("isNotificationSuppressedForActor");
  });

  it("community comment bump passes actorUserId", () => {
    const src = read("app/api/community/posts/[postId]/comments/route.ts");
    expect(src).toContain("actorUserId: auth.userId");
  });

  it("call init route delegates to startCommunityMessengerCallSession block gate", () => {
    const routeSrc = read("app/api/community-messenger/rooms/[roomId]/calls/route.ts");
    const serviceSrc = read("lib/community-messenger/service.ts");
    expect(routeSrc).toContain("startCommunityMessengerCallSession");
    expect(serviceSrc).toContain("ensureNoBlockedEitherWay(input.userId, peerUserId)");
  });

  it("admin block-history reads SSOT first", () => {
    const src = read("app/api/admin/chat/block-history/route.ts");
    expect(src).toContain('from("user_social_relations")');
    expect(src).toContain('source: "ssot"');
    expect(src).toContain('source: "legacy"');
  });
});
