import { describe, expect, it } from "vitest";
import { resolveSidebarExpanded } from "@/lib/admin-ui-prefs";

describe("관리자 사이드 메뉴 기본값 — 설계 v4 §2-4", () => {
  it("저장된 선택이 없으면 1024–1279px 은 compact(접힘)", () => {
    expect(resolveSidebarExpanded(null, 1024)).toBe(false);
    expect(resolveSidebarExpanded(null, 1279)).toBe(false);
  });

  it("저장된 선택이 없으면 ≥1280px 은 기존 기본(펼침)", () => {
    expect(resolveSidebarExpanded(null, 1280)).toBe(true);
    expect(resolveSidebarExpanded(null, 1920)).toBe(true);
  });

  it("1024 미만(가로 가드 영역·모바일 드로어)은 기존 기본 유지", () => {
    expect(resolveSidebarExpanded(null, 800)).toBe(true);
    expect(resolveSidebarExpanded(null, null)).toBe(true);
  });

  it("사용자가 저장한 선택이 항상 우선", () => {
    expect(resolveSidebarExpanded("1", 1100)).toBe(true);
    expect(resolveSidebarExpanded("0", 1600)).toBe(false);
  });
});
