import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(process.cwd());
const writeForm = readFileSync(join(root, "components/philife/PhilifeNeighborhoodWriteForm.tsx"), "utf8");
const chrome = readFileSync(join(root, "components/philife/PhilifeWriteComposerChrome.tsx"), "utf8");

/**
 * 글쓰기 주제 선택 계약 (Owner 2026-10-22 · 재설계 2026-11-01 — 주제 줄 + 아래 시트)
 * - native select 금지(iOS/APK/Windows 동일 UI), 주제 시트(listbox) — 작성기(z-1300) 위 nested 층
 * - 자동 첫 주제 선택 금지, 주제 변경은 폼 상태만(피드·글쓰기 URL 교체 없음)
 * - 등록 성공 후 게시글 상세로 이동
 */
describe("philife write topic sheet contract", () => {
  it("uses the topic row + bottom sheet listbox instead of native select / auto-first selection", () => {
    expect(writeForm).not.toMatch(/<\s*select\b/i);
    expect(writeForm).toContain("<PhilifeWriteTopicRow");
    expect(writeForm).toContain("<PhilifeWriteTopicSheet");
    expect(writeForm).toContain("applyWriteCategory");
    expect(writeForm).not.toContain("j.writeTopics![0]!.slug");
    expect(chrome).toContain('role="listbox"');
    expect(chrome).toContain('role="option"');
    // 시트는 작성기(z-1300) 위 — 작성기 아래 깔려 안 보이던 결함 재발 방지
    expect(chrome).toMatch(/PhilifeWriteTopicSheet[\s\S]*zIndexClass=\{MAIN_BOTTOM_NAV_NESTED_DIALOG_Z_CLASS\}/);
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

  it("purges the router cache after save so detail/edit never reopen with pre-edit values (실기 6차)", () => {
    expect(writeForm).toMatch(/router\.replace\(philifeAppPaths\.post\(editId\)\);[\s\S]{0,400}router\.refresh\(\);/);
    expect(writeForm).toMatch(/router\.replace\(philifeAppPaths\.post\(j\.id\)\);[\s\S]{0,200}router\.refresh\(\);/);
  });
});
