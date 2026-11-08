import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { adminNameEnViolation, normalizeAdminNameEn } from "@/lib/i18n/admin-name-en-contract";

const v = (creating: boolean, next: [string | null, string | null], prev?: [string | null, string | null]) =>
  adminNameEnViolation({
    creating,
    next: { name: next[0], nameEn: next[1] },
    prev: prev ? { name: prev[0], nameEn: prev[1] } : null,
  });

describe("어드민 등록 이름 영어 필수 (S7)", () => {
  it("새로 만들 때 영어 이름 필수", () => {
    expect(v(true, ["맛집", null])).toBe(true);
    expect(v(true, ["맛집", "  "])).toBe(true);
    expect(v(true, ["맛집", "Food"])).toBe(false);
  });
  it("수정 — 있던 영어 이름 비우기 거부", () => {
    expect(v(false, ["맛집", null], ["맛집", "Food"])).toBe(true);
  });
  it("수정 — 한국어 이름을 바꾸는데 영어 이름이 없으면 거부", () => {
    expect(v(false, ["맛집 이야기", null], ["맛집", null])).toBe(true);
    expect(v(false, ["맛집 이야기", "Food talk"], ["맛집", null])).toBe(false);
  });
  it("노출·순서만 바꾸는 저장은 통과 (영어 이름 없는 기존 행, 행 전체 재전송 포함)", () => {
    expect(v(false, ["추천", null], ["추천", null])).toBe(false);
  });
  it("정리", () => {
    expect(normalizeAdminNameEn("  Food ")).toBe("Food");
    expect(normalizeAdminNameEn("  ")).toBeNull();
  });
});


describe("S7 — 고객 화면 이름을 저장하는 어드민 API 는 같은 규칙을 쓴다", () => {
  it.each([
    "app/api/admin/community/topics/route.ts",
    "app/api/admin/community/topics/[id]/route.ts",
    "app/api/admin/trade/categories/route.ts",
    "app/api/admin/stores/taxonomy/route.ts",
  ])("%s", (f) => {
    const src = readFileSync(f, "utf8");
    expect(src).toContain("adminNameEnViolation(");
    expect(src).toContain("ADMIN_NAME_EN_REQUIRED_ERROR");
  });

  it("거래 카테고리 어드민 폼은 영어 이름을 입력·전송한다(만들기·수정, 상위·하위)", () => {
    const src = readFileSync("components/admin/menus/AdminMenusPage.tsx", "utf8");
    expect(src).toContain('t("admin_menu_trade_label_name_en")');
    expect(src.match(/name_en: rootNameEn\.trim\(\) \|\| null/g)?.length).toBe(2);
    expect(src.match(/name_en: childNameEn\.trim\(\) \|\| null/g)?.length).toBe(2);
  });

  it("업종 기본 시드도 영어 이름을 저장한다", () => {
    const src = readFileSync("app/api/admin/stores/taxonomy/route.ts", "utf8");
    expect(src).toContain("name_en: c.nameEn");
    expect(src).toContain("name_en: t.nameEn");
  });
});
