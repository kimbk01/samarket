import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/community-messenger/social-relations", () => ({
  getBlockedRelation: vi.fn(),
}));

vi.mock("@/lib/notifications/append-user-notification", () => ({
  appendUserNotification: vi.fn(async () => true),
}));

vi.mock("@/lib/chats/resolve-author-nickname", () => ({
  fetchNicknamesForUserIds: vi.fn(async () => new Map([["commenter-1", "B"]])),
}));

vi.mock("@/lib/notifications/notification-user-language", () => ({
  loadNotificationUserLanguage: vi.fn(async () => "ko"),
}));

import { getBlockedRelation } from "@/lib/community-messenger/social-relations";
import { appendUserNotification } from "@/lib/notifications/append-user-notification";
import {
  notifyCommunityPostCommentReceived,
  notifyCommunityPostLikeReceived,
} from "@/lib/notifications/community-social-inapp-notify";

const sb = {} as never;

describe("community social notify block gate", () => {
  beforeEach(() => {
    vi.mocked(getBlockedRelation).mockReset();
    vi.mocked(appendUserNotification).mockClear();
  });

  it("skips comment notification when recipient blocked commenter", async () => {
    vi.mocked(getBlockedRelation).mockResolvedValue({
      blockedByMe: true,
      blockedByPeer: false,
      blockedEitherWay: true,
    });

    await notifyCommunityPostCommentReceived(sb, {
      postId: "post-1",
      postAuthorUserId: "author-a",
      commenterUserId: "commenter-b",
      commentPreview: "hello",
    });

    expect(appendUserNotification).not.toHaveBeenCalled();
  });

  it("sends comment notification when no block relation", async () => {
    vi.mocked(getBlockedRelation).mockResolvedValue({
      blockedByMe: false,
      blockedByPeer: false,
      blockedEitherWay: false,
    });

    await notifyCommunityPostCommentReceived(sb, {
      postId: "post-1",
      postAuthorUserId: "author-a",
      commenterUserId: "commenter-b",
      commentPreview: "hello",
    });

    expect(appendUserNotification).toHaveBeenCalledTimes(1);
  });

  it("skips like notification when post author blocked liker", async () => {
    vi.mocked(getBlockedRelation).mockResolvedValue({
      blockedByMe: false,
      blockedByPeer: true,
      blockedEitherWay: true,
    });

    await notifyCommunityPostLikeReceived(sb, {
      postId: "post-1",
      postAuthorUserId: "author-a",
      likerUserId: "liker-b",
    });

    expect(appendUserNotification).not.toHaveBeenCalled();
  });
});
