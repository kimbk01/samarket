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

  it("error band follows the remaining empty fields — picking a topic clears its notice (실기 2026-11-01 iPhone)", () => {
    expect(writeForm).toContain("const firstFieldErr = fieldErr.topic ?? fieldErr.title ?? fieldErr.content");
    expect(writeForm).toMatch(/const bandMessage = err \|\| firstFieldErr/);
    expect(writeForm).not.toContain("setErr(nextFieldErr.topic");
    expect(writeForm).not.toContain("setErr(editFieldErr.title");
  });

  it("Owner 확정 2026-11-01 — 나가기는 공통 하단 시트 1종(작성기·탭 이동 같은 컴포넌트)", () => {
    const ctx = readFileSync(join(root, "contexts/PhilifeWriteSheetContext.tsx"), "utf8");
    expect(writeForm).toContain("<PhilifeWriteLeaveSheet");
    expect(ctx).toContain("<PhilifeWriteLeaveSheet");
    expect(writeForm).not.toContain("dibayConfirm");
    expect(ctx).not.toContain("MobileConfirmBottomSheet");
    expect(chrome).toMatch(/export function PhilifeWriteLeaveSheet[\s\S]*<DibayBottomSheet/);
  });

  it("뒤로가기는 열린 사진 설명 시트부터 닫는다", () => {
    expect(writeForm).toContain("editorApiRef.current?.dismissSheet()");
  });

  it("업로드 정리는 세션 객체 하나로 — 작성기가 사라질 때·문서가 내려갈 때 abandon, 등록·나가기 때 close", () => {
    expect(writeForm).toContain("createWriteUploadSession()");
    expect(writeForm).toMatch(
      /uploadSession\.reopen\(\);\s*const unbindPageHide = abandonWriteUploadSessionOnPageHide\(uploadSession\);\s*return \(\) => \{\s*unbindPageHide\(\);\s*uploadSession\.abandon\(\);\s*\};/
    );
    expect(writeForm).toContain("const discardUnusedUploads = uploadSession.close;");
    expect(writeForm).not.toContain("discardCommunityUploads(");
  });

  it("사진 수 = 본문 + 첨부, 같은 주소 1장 · 최대 10장", () => {
    expect(writeForm).toContain("imageUrls.filter((u) => !editorBodyImageUrls.has(u))");
    expect(writeForm).toContain("COMMUNITY_MEMBER_POST_MAX_IMAGES - attachmentOnlyCount");
  });

  it("주제 0개 관리 링크는 관리자에게만 · 본문 안내 2줄", () => {
    expect(writeForm).toContain("shouldShowNoTopicsAdminLink(noTopics, me)");
    expect(writeForm).toContain("{showAdminTopicsLink ? (");
    expect((writeForm.match(/philife_write_content_placeholder_photo_hint/g) || []).length).toBe(2);
  });
});
