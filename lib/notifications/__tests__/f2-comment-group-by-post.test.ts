/**
 * F-2 (재감사 2026-11-01) — 같은 게시글 댓글 알림 = 카드 1개. 행 모양은 운영 DB 실측(2026-11-01) 그대로
 * (`notification_type=report`, `domain=community_chat`, `meta.kind=community_comment`, `meta.post_id`).
 */
import { describe, expect, it } from "vitest";
import { buildInboxGroupItems, groupKeyForInboxRow } from "@/lib/notifications/group-inbox-by-thread";

type Row = Parameters<typeof buildInboxGroupItems>[0][number];

function comment(id: string, postId: string, at: string, read = false, body = `댓글 ${id}`): Row {
  return {
    id,
    notification_type: "report",
    title: "zxzx11님이 댓글을 남겼어요",
    body,
    link_url: `/community/posts/${postId}`,
    is_read: read,
    created_at: at,
    meta: { kind: "community_comment", post_id: postId, comment_id: `c-${id}` },
    domain: "community_chat",
    push_kind: "community",
  } as Row;
}

function like(id: string, postId: string, at: string): Row {
  return {
    id,
    notification_type: "report",
    title: "zxzx11님이 게시글을 좋아합니다",
    body: "",
    link_url: `/community/posts/${postId}`,
    is_read: false,
    created_at: at,
    meta: { kind: "community_like", post_id: postId },
    domain: "community_chat",
    push_kind: "community",
  } as Row;
}

function chat(id: string, roomId: string, at: string): Row {
  return {
    id,
    notification_type: "chat",
    title: "w테스트1",
    body: "hi",
    link_url: `/community-messenger/rooms/${roomId}`,
    is_read: false,
    created_at: at,
    meta: { room_id: roomId },
    domain: "community_chat",
  } as Row;
}

describe("F-2 comment notifications group by post", () => {
  it("1 comment → 1 card, no group count", () => {
    const items = buildInboxGroupItems([comment("a", "P1", "2026-11-01T00:13:51Z")]);
    expect(items).toHaveLength(1);
    expect(items[0]!.ids).toEqual(["a"]);
  });

  it("3 unread comments on one post → 1 card, 3 unread events (bell counts events, not cards)", () => {
    const items = buildInboxGroupItems([
      comment("c", "P1", "2026-11-01T00:15:51Z"),
      comment("b", "P1", "2026-11-01T00:15:38Z"),
      comment("a", "P1", "2026-11-01T00:15:25Z"),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]!.ids).toEqual(["c", "b", "a"]);
    expect(items[0]!.unreadCount).toBe(3);
    // 카드 내용·시간·목적지 = 최신 댓글, 탭하면 그 글
    expect(items[0]!.body).toBe("댓글 c");
    expect(items[0]!.created_at).toBe("2026-11-01T00:15:51Z");
    expect(items[0]!.href).toContain("/community/posts/P1");
  });

  it("mixed read: read history stays in the card, unread count only counts unread", () => {
    const items = buildInboxGroupItems([
      comment("c", "P1", "2026-11-01T00:15:51Z"),
      comment("b", "P1", "2026-11-01T00:14:03Z", true),
      comment("a", "P1", "2026-10-28T12:14:02Z", true),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]!.ids).toHaveLength(3);
    expect(items[0]!.unreadCount).toBe(1);
  });

  it("a new comment moves the post card above newer other notifications", () => {
    const items = buildInboxGroupItems([
      comment("old", "P1", "2026-11-01T00:10:00Z"),
      chat("m1", "R1", "2026-11-01T00:12:00Z"),
      comment("new", "P1", "2026-11-01T00:14:00Z"),
    ]);
    expect(items.map((i) => i.ids)).toEqual([["new", "old"], ["m1"]]);
  });

  it("different posts stay separate; likes and chats are not merged into the comment card", () => {
    const rows = [
      comment("a", "P1", "2026-11-01T00:15:00Z"),
      comment("b", "P2", "2026-11-01T00:14:00Z"),
      like("l", "P1", "2026-11-01T00:13:00Z"),
      chat("m", "R1", "2026-11-01T00:12:00Z"),
    ];
    const keys = rows.map((r) => groupKeyForInboxRow(r));
    expect(keys[0]).toBe("post:P1");
    expect(keys[1]).toBe("post:P2");
    expect(keys[2]).toBe("one:l");
    expect(keys[3]).toBe("cm:R1");
    expect(buildInboxGroupItems(rows)).toHaveLength(4);
  });

  it("legacy stored comment rows (2026-09 「새 댓글」 shape) group the same way", () => {
    const legacy = { ...comment("s", "P1", "2026-09-24T15:46:29Z", true, "CD-C1"), title: "새 댓글" } as Row;
    const items = buildInboxGroupItems([comment("n", "P1", "2026-11-01T00:15:00Z"), legacy]);
    expect(items).toHaveLength(1);
    expect(items[0]!.ids).toEqual(["n", "s"]);
  });
});
