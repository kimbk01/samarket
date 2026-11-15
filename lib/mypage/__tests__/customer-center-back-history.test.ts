import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 고객센터 머리글 뒤로 = 앞 화면으로 (2026-11-16 Owner 「고쳐서 반영」).
 * `preferHistoryBack={false}` + `backHref="/mypage"` 는 `MySubpageHeader` 가 분류 부모(고객지원)로 바꿔
 * 뒤로가 고객지원을 새로 쌓았다 → 고객지원(앞 화면으로) ↔ 고객센터 무한 반복. 같은 조합이 다시 생기지 않게 고정한다.
 */
const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("customer center back — history first (no loop with 고객지원)", () => {
  it("고객센터 화면은 뒤로를 고정 이동으로 지정하지 않는다", () => {
    const src = read("components/mypage/cs/CustomerCenterHubClient.tsx");
    expect(src).not.toContain("preferHistoryBack={false}");
    expect(src).toContain('backHref="/mypage"');
  });

  it("MyScreen 기본값 = 앞 화면으로", () => {
    expect(read("components/mypage/ds/MyScreen.tsx")).toContain("preferHistoryBack = true,");
  });
});
