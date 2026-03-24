import { describe, expect, it } from "vitest";
import { mapBoardRow, normalizeFormType, normalizeSkinType, parsePolicy } from "./board-row-mapper";

describe("parsePolicy", () => {
  it("원시값이면 빈 정책", () => {
    expect(parsePolicy(null)).toEqual({});
  });

  it("빈 객체는 기능 기본 허용으로 해석", () => {
    expect(parsePolicy({})).toMatchObject({
      allow_comment: true,
      allow_like: true,
      allow_report: true,
    });
  });

  it("명시적 false 반영", () => {
    expect(parsePolicy({ allow_comment: false, allow_like: false })).toMatchObject({
      allow_comment: false,
      allow_like: false,
    });
  });
});

describe("normalizeSkinType", () => {
  it("허용 스킨 유지", () => {
    expect(normalizeSkinType("gallery")).toBe("gallery");
  });

  it("알 수 없는 값은 basic", () => {
    expect(normalizeSkinType("unknown")).toBe("basic");
  });
});

describe("normalizeFormType", () => {
  it("gallery/qna/promo 유지", () => {
    expect(normalizeFormType("qna")).toBe("qna");
  });

  it("magazine 등은 작성 폼 basic으로", () => {
    expect(normalizeFormType("magazine")).toBe("basic");
  });
});

describe("mapBoardRow", () => {
  it("boards 행을 Board로 매핑", () => {
    const b = mapBoardRow({
      id: "b1",
      service_id: "s1",
      name: "자유",
      slug: "free",
      description: "desc",
      skin_type: "basic",
      form_type: "basic",
      category_mode: "board_category",
      policy: { allow_comment: true },
      is_active: true,
      sort_order: 1,
    });
    expect(b.slug).toBe("free");
    expect(b.category_mode).toBe("board_category");
    expect(b.policy.allow_comment).toBe(true);
  });
});
