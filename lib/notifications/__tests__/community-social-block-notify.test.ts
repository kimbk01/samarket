import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/community-messenger/social-relations", () => ({
  getBlockedRelation: vi.fn(),
}));

vi.mock("@/lib/notifications/append-user-notification", () => ({
  appendUserNotification: vi.fn(async () => true),
}));

vi.mock("@/lib/chats/resolve-author-nickname", () => ({
  fetchNicknamesForUserIds: vi.fn(async () => new Map([["commenter-b", "B"], ["liker-b", "B"]])),
}));

vi.mock("@/lib/notifications/notification-user-language", () => ({
  loadNotificationUserLanguage: vi.fn(async () => "ko"),
}));

import { getBlockedRelation } from "@/lib/community-messenger/social-relations";
import { appendUserNotification } from "@/lib/notifications/append-user-notification";
import {
  buildCommunityCommentNotificationDedupeKey,
  buildCommunityLikeNotificationDedupeKey,
  notifyCommunityPostCommentReceived,
  notifyCommunityPostLikeReceived,
} from "@/lib/notifications/community-social-inapp-notify";

const sb = {} as never;
const RECIPIENT = "author-a";
const OTHER = "author-other";

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
      commentId: "comment-1",
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
      commentId: "comment-1",
    });

    expect(appendUserNotification).toHaveBeenCalledTimes(1);
    expect(vi.mocked(appendUserNotification).mock.calls[0]?.[1]).toMatchObject({
      dedupe_key: buildCommunityCommentNotificationDedupeKey("author-a", "comment-1"),
      meta: expect.objectContaining({ comment_id: "comment-1", kind: "community_comment" }),
    });
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
      likeId: "like-1",
    });

    expect(appendUserNotification).not.toHaveBeenCalled();
  });
});

describe("community social per-activity dedupe identity (T1–T7)", () => {
  beforeEach(() => {
    vi.mocked(getBlockedRelation).mockResolvedValue({
      blockedByMe: false,
      blockedByPeer: false,
      blockedEitherWay: false,
    });
    vi.mocked(appendUserNotification).mockClear();
  });

  it("T1 COMMENT DISTINCT — two comments → two keys", () => {
    const a = buildCommunityCommentNotificationDedupeKey(RECIPIENT, "comment-a");
    const b = buildCommunityCommentNotificationDedupeKey(RECIPIENT, "comment-b");
    expect(a).not.toBe(b);
    expect(a).toContain("community_comment");
    expect(a).not.toMatch(/:report:/);
  });

  it("T2 COMMENT RETRY — same comment → same key", async () => {
    const key = buildCommunityCommentNotificationDedupeKey(RECIPIENT, "comment-a");
    await notifyCommunityPostCommentReceived(sb, {
      postId: "post-1",
      postAuthorUserId: RECIPIENT,
      commenterUserId: "commenter-b",
      commentPreview: "hello",
      commentId: "comment-a",
    });
    await notifyCommunityPostCommentReceived(sb, {
      postId: "post-1",
      postAuthorUserId: RECIPIENT,
      commenterUserId: "commenter-b",
      commentPreview: "hello",
      commentId: "comment-a",
    });
    expect(vi.mocked(appendUserNotification).mock.calls).toHaveLength(2);
    expect(vi.mocked(appendUserNotification).mock.calls[0]?.[1]?.dedupe_key).toBe(key);
    expect(vi.mocked(appendUserNotification).mock.calls[1]?.[1]?.dedupe_key).toBe(key);
  });

  it("T3 COMMENT VS LIKE — distinct keys on same post", () => {
    const comment = buildCommunityCommentNotificationDedupeKey(RECIPIENT, "comment-a");
    const like = buildCommunityLikeNotificationDedupeKey(RECIPIENT, "like-row-1");
    expect(comment).not.toBe(like);
    expect(comment).not.toBe(`legacy:${RECIPIENT}:report:post-1`);
    expect(like).not.toBe(`legacy:${RECIPIENT}:report:post-1`);
  });

  it("T4 LIKE RETRY — same like row → same key", async () => {
    const key = buildCommunityLikeNotificationDedupeKey(RECIPIENT, "like-row-1");
    await notifyCommunityPostLikeReceived(sb, {
      postId: "post-1",
      postAuthorUserId: RECIPIENT,
      likerUserId: "liker-b",
      likeId: "like-row-1",
    });
    await notifyCommunityPostLikeReceived(sb, {
      postId: "post-1",
      postAuthorUserId: RECIPIENT,
      likerUserId: "liker-b",
      likeId: "like-row-1",
    });
    expect(vi.mocked(appendUserNotification).mock.calls[0]?.[1]?.dedupe_key).toBe(key);
    expect(vi.mocked(appendUserNotification).mock.calls[1]?.[1]?.dedupe_key).toBe(key);
  });

  it("T5 REPLY DISTINCT — reply child id ≠ parent comment id", () => {
    const parent = buildCommunityCommentNotificationDedupeKey(RECIPIENT, "comment-parent");
    const reply = buildCommunityCommentNotificationDedupeKey(RECIPIENT, "comment-reply-child");
    expect(parent).not.toBe(reply);
  });

  it("T6 RECIPIENT ISOLATION — same comment different recipients → different keys", () => {
    const a = buildCommunityCommentNotificationDedupeKey(RECIPIENT, "comment-a");
    const b = buildCommunityCommentNotificationDedupeKey(OTHER, "comment-a");
    expect(a).not.toBe(b);
  });

  it("T7 writer emits activity keys not post-level report key", async () => {
    await notifyCommunityPostCommentReceived(sb, {
      postId: "post-1",
      postAuthorUserId: RECIPIENT,
      commenterUserId: "commenter-b",
      commentPreview: "x",
      commentId: "c1",
    });
    await notifyCommunityPostLikeReceived(sb, {
      postId: "post-1",
      postAuthorUserId: RECIPIENT,
      likerUserId: "liker-b",
      likeId: "l1",
    });
    const keys = vi.mocked(appendUserNotification).mock.calls.map((c) => c[1]?.dedupe_key);
    expect(keys[0]).toBe(buildCommunityCommentNotificationDedupeKey(RECIPIENT, "c1"));
    expect(keys[1]).toBe(buildCommunityLikeNotificationDedupeKey(RECIPIENT, "l1"));
    expect(keys[0]).not.toBe(keys[1]);
    for (const k of keys) {
      expect(k).not.toBe(`legacy:${RECIPIENT}:report:post-1`);
    }
  });

  it("skips comment notify when commentId missing (no invented key)", async () => {
    await notifyCommunityPostCommentReceived(sb, {
      postId: "post-1",
      postAuthorUserId: RECIPIENT,
      commenterUserId: "commenter-b",
      commentPreview: "x",
      commentId: "",
    });
    expect(appendUserNotification).not.toHaveBeenCalled();
  });
});
