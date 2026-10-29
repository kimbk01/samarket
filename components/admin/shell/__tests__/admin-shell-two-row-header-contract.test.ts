import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

/** 감사 UX-01~05 (2026-10-30 · Owner 권장안 승인) — 2단 헤더 · 실측 「더보기」 · 사이드바 위계 */
describe("Admin 셸 2단 헤더·사이드바 위계", () => {
  it("워크스페이스 탭은 도구 줄과 다른 줄 (2단)", () => {
    const shell = read("components/admin/shell/AdminPlatformShell.tsx");
    const navAt = shell.indexOf("<AdminWorkspaceNav");
    const accountAt = shell.indexOf("<AdminHeaderAccountMenu");
    expect(navAt).toBeGreaterThan(accountAt);
    expect(shell.slice(accountAt, navAt)).toContain("border-t");
    // 언어 전환 · 홈페이지 이동은 계정 메뉴 안
    expect(shell).toContain("languageToggle={<AdminLanguageToggleLazy />}");
    expect(read("components/admin/shell/AdminHeaderAccountMenu.tsx")).toContain('href="/philife"');
  });

  it("「더보기」는 화면 폭 구간이 아니라 실제 넘침으로 표시", () => {
    const nav = read("components/admin/shell/AdminWorkspaceNav.tsx");
    expect(nav).not.toContain("xl:hidden");
    expect(nav).not.toContain("workspaces.length > 8");
    expect(nav).toContain("ResizeObserver");
    expect(nav).toContain("hiddenWorkspaces.map");
  });

  it("섹션 제목은 하위 항목보다 작지 않다 (13px) · 하위 항목 들여쓰기 · 펼침 기억", () => {
    const css = read("app/samarket-components.css");
    const block = css.slice(css.indexOf("[data-admin] .admin-sidebar__group-title {"));
    expect(block.slice(0, 600)).toContain("font-size: 0.8125rem");
    const group = read("components/admin/sidebar/AdminSidebarGroup.tsx");
    expect(group).toContain("admin-sidebar__group-items ml-3");
    expect(group).toContain("writeSidebarGroupOpen(item.key, next)");
  });

  it("새로고침·새 탭: 저장된 진입 워크스페이스를 읽기 전에는 판정 결과로 덮어쓰지 않는다 (운영 실측 2026-10-30)", () => {
    const shell = read("components/admin/shell/AdminPlatformShell.tsx");
    const effectAt = shell.indexOf("if (activeWorkspace.id !== entryWorkspaceId) rememberWorkspace(activeWorkspace.id);");
    expect(effectAt).toBeGreaterThan(0);
    expect(shell.slice(effectAt - 120, effectAt)).toContain("if (!entryWorkspaceLoaded) return;");
    expect(shell).toContain("setEntryWorkspaceLoaded(true);");
  });
});
