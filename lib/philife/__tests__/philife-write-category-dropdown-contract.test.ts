import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(process.cwd());
const writeForm = readFileSync(join(root, "components/philife/PhilifeNeighborhoodWriteForm.tsx"), "utf8");
const dropdown = readFileSync(join(root, "components/philife/PhilifeWriteTopicDropdown.tsx"), "utf8");

/**
 * 글쓰기 주제 선택 계약 (Owner 2026-10-22 — 드롭다운)
 * - native select 금지(iOS/APK/Windows 동일 UI), 커스텀 listbox 드롭다운(포털 · 패널 내 스크롤)
 * - 자동 첫 주제 선택 금지, 주제 변경은 폼 상태만(피드·글쓰기 URL 교체 없음)
 * - 등록 성공 후 게시글 상세로 이동
 */
describe("philife write topic dropdown contract", () => {
  it("uses a custom listbox dropdown instead of native select / auto-first selection", () => {
    expect(writeForm).not.toContain("PHILIFE_WRITE_SELECT_CLASS");
    expect(writeForm).not.toMatch(/<\s*select\b/i);
    expect(writeForm).toContain("<PhilifeWriteTopicDropdown");
    expect(writeForm).toContain("applyWriteCategory");
    expect(writeForm).not.toContain("j.writeTopics![0]!.slug");
    expect(dropdown).toContain('role="listbox"');
    expect(dropdown).toContain('role="option"');
    expect(dropdown).toContain("createPortal");
    expect(dropdown).toMatch(/maxHeight/);
    // 패널은 글쓰기 시트(z-1300) 위 — 시트 아래 깔려 안 보이던 결함 재발 방지
    const z = Number(/const PANEL_Z_INDEX = (\d+)/.exec(dropdown)?.[1] ?? 0);
    expect(z).toBeGreaterThan(1300);
  });

  it("does not live-replace feed or write URL when the topic changes", () => {
    const at = writeForm.indexOf("const applyWriteCategory");
    const apply = writeForm.slice(at, at + 600);
    expect(apply).not.toContain("router.replace");
    expect(apply).not.toContain("buildCommunityFeedHref");
  });

  it("navigates to the post detail after a successful create", () => {
    expect(writeForm).toContain("router.replace(philifeAppPaths.post(j.id))");
    expect(writeForm).toContain("clearAllPhilifeFeedPersistentCaches()");
  });
});
