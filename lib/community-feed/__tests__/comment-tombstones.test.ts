import { describe, expect, it } from "vitest";
import { selectCommentRowsWithTombstones } from "@/lib/community-feed/comment-tombstones";

type Row = { id: string; parent_id: string | null; shown: boolean };
const rows = (list: Row[]) => list;

describe("댓글 tombstone (CM-P3-03)", () => {
  it("답글이 살아 있는 삭제 부모는 자리만 남기고, 답글 없는 삭제 댓글은 뺀다", () => {
    const r = rows([
      { id: "a", parent_id: null, shown: false },
      { id: "a1", parent_id: "a", shown: true },
      { id: "b", parent_id: null, shown: false },
      { id: "c", parent_id: null, shown: true },
    ]);
    const out = selectCommentRowsWithTombstones(r, (x) => x.shown);
    expect(out.keptRows.map((x) => x.id)).toEqual(["a", "a1", "c"]);
    expect([...out.removedIds]).toEqual(["a"]);
  });

  it("여러 단계 조상까지 자리 유지, 순환 참조에도 멈춘다", () => {
    const r = rows([
      { id: "x", parent_id: "z", shown: false },
      { id: "y", parent_id: "x", shown: false },
      { id: "z", parent_id: "y", shown: true },
    ]);
    const out = selectCommentRowsWithTombstones(r, (x) => x.shown);
    expect(out.keptRows.map((x) => x.id).sort()).toEqual(["x", "y", "z"]);
    expect([...out.removedIds].sort()).toEqual(["x", "y"]);
  });
});
