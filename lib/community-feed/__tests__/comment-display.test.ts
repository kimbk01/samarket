/**
 * 라운지 댓글 표시 상태 — 서버 단일 판정 (감사 L2·L3·L4·L10·L16 · 설계 §6.2·§6.7). 동작 시험.
 */
import { describe, expect, it } from "vitest";
import {
  countPublicComments,
  resolveCommentDisplayState,
  resolveCommunityCommentModerationKind,
  selectCommentDisplayRows,
  type CommentDisplayRow,
} from "@/lib/community-feed/comment-display";

const none = { blockedByMe: new Set<string>(), blockedMe: new Set<string>() };
const row = (id: string, over: Partial<CommentDisplayRow> = {}): CommentDisplayRow => ({
  id,
  user_id: `u-${id}`,
  parent_id: null,
  status: "active",
  is_hidden: false,
  is_deleted: false,
  moderated_by: null,
  ...over,
});

describe("resolveCommentDisplayState", () => {
  it("작성자 삭제(관리자 표시 없음) = deleted_by_author", () => {
    expect(resolveCommentDisplayState(row("a", { status: "deleted" }), none)).toBe("deleted_by_author");
    expect(resolveCommentDisplayState(row("a", { status: "deleted", is_deleted: true }), none)).toBe("deleted_by_author");
  });
  it("관리자 삭제·숨김 = removed_by_admin", () => {
    expect(resolveCommentDisplayState(row("a", { status: "deleted", moderated_by: "admin" }), none)).toBe("removed_by_admin");
    expect(resolveCommentDisplayState(row("a", { status: "hidden", is_hidden: true, moderated_by: "admin" }), none)).toBe(
      "removed_by_admin"
    );
    expect(resolveCommentDisplayState(row("a", { is_hidden: true }), none)).toBe("removed_by_admin");
  });
  it("내가 차단 = blocked_author, 나를 차단 = unavailable", () => {
    const blocks = { blockedByMe: new Set(["u-a"]), blockedMe: new Set(["u-b"]) };
    expect(resolveCommentDisplayState(row("a"), blocks)).toBe("blocked_author");
    expect(resolveCommentDisplayState(row("b"), blocks)).toBe("unavailable");
    expect(resolveCommentDisplayState(row("c"), blocks)).toBe("visible");
  });
});

describe("selectCommentDisplayRows", () => {
  it("답글 없는 삭제 댓글은 빠지고, 살아 있는 답글이 있으면 자리로 남는다", () => {
    const rows = [
      row("gone", { status: "deleted" }),
      row("parent", { status: "deleted" }),
      row("child", { parent_id: "parent" }),
    ];
    const kept = selectCommentDisplayRows(rows, none);
    expect(kept.map((k) => [k.row.id, k.state])).toEqual([
      ["parent", "deleted_by_author"],
      ["child", "visible"],
    ]);
  });

  it("차단한 사람 댓글은 답글이 없어도 자리로 남고, 그 아래 다른 사람 답글은 그대로 보인다 (결정 3 · L10)", () => {
    const rows = [row("x"), row("y", { parent_id: "x" }), row("z", { parent_id: "y" })];
    const blocks = { blockedByMe: new Set(["u-x"]), blockedMe: new Set<string>() };
    const kept = selectCommentDisplayRows(rows, blocks);
    expect(kept.map((k) => [k.row.id, k.state])).toEqual([
      ["x", "blocked_author"],
      ["y", "visible"],
      ["z", "visible"],
    ]);
    const lone = selectCommentDisplayRows([row("x")], blocks);
    expect(lone.map((k) => k.state)).toEqual(["blocked_author"]);
  });

  it("나를 차단한 사람 댓글은 답글이 있을 때만 중립 자리, 없으면 빠진다", () => {
    const blocks = { blockedByMe: new Set<string>(), blockedMe: new Set(["u-x", "u-solo"]) };
    const kept = selectCommentDisplayRows([row("x"), row("y", { parent_id: "x" }), row("solo")], blocks);
    expect(kept.map((k) => [k.row.id, k.state])).toEqual([
      ["x", "unavailable"],
      ["y", "visible"],
    ]);
  });
});

describe("countPublicComments", () => {
  it("공개 댓글만 센다 — 삭제·숨김 자리는 「댓글 N」에 들지 않는다 (L4)", () => {
    const rows = [
      row("a"),
      row("b", { status: "deleted" }),
      row("c", { parent_id: "b" }),
      row("d", { status: "hidden", is_hidden: true }),
    ];
    expect(countPublicComments(rows)).toBe(2);
  });
});

describe("resolveCommunityCommentModerationKind", () => {
  it("콘솔 배지 4종", () => {
    expect(resolveCommunityCommentModerationKind(row("a"))).toBe("active");
    expect(resolveCommunityCommentModerationKind(row("a", { status: "deleted" }))).toBe("deleted_by_author");
    expect(resolveCommunityCommentModerationKind(row("a", { status: "deleted", moderated_by: "m" }))).toBe("deleted_by_admin");
    expect(resolveCommunityCommentModerationKind(row("a", { status: "hidden", moderated_by: "m" }))).toBe("hidden");
  });
});
