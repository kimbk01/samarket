import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(process.cwd());
const writeForm = readFileSync(
  join(root, "components/philife/PhilifeNeighborhoodWriteForm.tsx"),
  "utf8"
);

/**
 * 글쓰기 주제 선택 계약 (2026-10-22 Owner 승인 — 주제 선택 단계)
 * - native select 금지(iOS/APK/Windows 동일 UI), 같은 시트·페이지 안 1단계 라디오 목록
 * - 자동 첫 주제 선택 금지, 주제 변경은 폼 상태만(피드·글쓰기 URL 교체 없음)
 * - 등록 성공 후 게시글 상세로 이동
 */
describe("philife write topic step contract", () => {
  it("uses an in-form radio topic step instead of native select / auto-first selection", () => {
    expect(writeForm).not.toContain("PHILIFE_WRITE_SELECT_CLASS");
    expect(writeForm).not.toMatch(/<\s*select\b/i);
    expect(writeForm).toContain('role="radiogroup"');
    expect(writeForm).toContain('role="radio"');
    expect(writeForm).toContain("applyWriteCategory");
    expect(writeForm).not.toContain("j.writeTopics![0]!.slug");
  });

  it("does not live-replace feed or write URL when the topic changes", () => {
    const apply = writeForm.slice(writeForm.indexOf("const applyWriteCategory"), writeForm.indexOf("const applyWriteCategory") + 600);
    expect(apply).not.toContain("router.replace");
    expect(apply).not.toContain("buildCommunityFeedHref");
  });

  it("navigates to the post detail after a successful create", () => {
    expect(writeForm).toContain("router.replace(philifeAppPaths.post(j.id))");
    expect(writeForm).toContain("clearAllPhilifeFeedPersistentCaches()");
  });
});
