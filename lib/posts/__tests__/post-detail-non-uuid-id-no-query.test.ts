import { describe, expect, it, vi } from "vitest";
import { loadPostRowForDetail } from "@/lib/posts/map-post-detail-row";

describe("글 상세 행 조회 — uuid 가 아닌 id 는 DB 조회 없이 null (운영 uuid 오류 2026-11-14)", () => {
  it("샘플 카드 id(showcase-…)는 조회하지 않는다", async () => {
    const from = vi.fn();
    const row = await loadPostRowForDetail({ from } as never, "posts", "showcase-c35e7fe8-6afe-42fd-a11d-0cd3cd8c7d11");
    expect(row).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it("uuid 는 그대로 조회한다", async () => {
    const id = "c35e7fe8-6afe-42fd-a11d-0cd3cd8c7d11";
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id }, error: null });
    const eq = vi.fn(() => ({ maybeSingle }));
    const from = vi.fn(() => ({ select: () => ({ eq }) }));
    const row = await loadPostRowForDetail({ from } as never, "posts", id);
    expect(row).toEqual({ id });
    expect(eq).toHaveBeenCalledWith("id", id);
  });
});
