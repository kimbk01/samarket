/**
 * 고객센터 접수형 3단계 (Owner 「3단계 진행」 2026-11-10) — 어드민 문의 유형 관리.
 * 정의·서버 판정 = 코드, 어드민은 이름(ko/en)·순서·노출만 덮어쓴다. 「기타」는 숨길 수 없다.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MESSAGES } from "@/lib/i18n/messages";
import { listIssueTypesForCategory, validateSupportCategoryForOpen } from "@/lib/support/support-category-registry";
import {
  adminEditableSupportCategories,
  indexSupportCategorySettings,
  isSupportCategoryHideLocked,
  supportCategorySettingLabel,
  validateSupportCategorySettingInput,
  visibleSupportCategories,
  visibleSupportIssues,
  type SupportCategorySettingRow,
} from "@/lib/support/support-category-settings";
import { listSupportTicketCategories } from "@/lib/support/support-ticket-form";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const row = (p: Partial<SupportCategorySettingRow>): SupportCategorySettingRow => ({
  audience: "MEMBER",
  category_id: "COUPON",
  issue_id: "",
  label_ko: null,
  label_en: null,
  sort_order: null,
  hidden: false,
  ...p,
});

describe("설정 적용 — 이름·순서·숨김", () => {
  const base = () => listSupportTicketCategories({ audience: "MEMBER", viewerHasStore: false });

  it("설정 없음 = 코드 기본 순서·전부 노출, 「기타」는 맨 뒤", () => {
    const ids = visibleSupportCategories(indexSupportCategorySettings([]), "MEMBER", base()).map((c) => c.id);
    expect(ids).toEqual(base().map((c) => c.id));
    expect(ids[ids.length - 1]).toBe("OTHER");
  });

  it("순서 값으로 정렬, 숨김은 빠짐, 「기타」는 숨김 설정이 있어도 남고 맨 뒤", () => {
    const idx = indexSupportCategorySettings([
      row({ category_id: "ACCOUNT", sort_order: 30 }),
      row({ category_id: "REPORT", sort_order: 0 }),
      row({ category_id: "COUPON", hidden: true }),
      row({ category_id: "OTHER", hidden: true, sort_order: 0 }),
    ]);
    const ids = visibleSupportCategories(idx, "MEMBER", base()).map((c) => c.id);
    expect(ids[0]).toBe("REPORT");
    expect(ids).not.toContain("COUPON");
    expect(ids[ids.length - 1]).toBe("OTHER");
  });

  it("세부도 같은 규칙 — 「기타」 세부는 항상 남는다", () => {
    const idx = indexSupportCategorySettings([
      row({ category_id: "COUPON", issue_id: "COUPON_EXPIRED", hidden: true }),
      row({ category_id: "COUPON", issue_id: "OTHER", hidden: true }),
    ]);
    const ids = visibleSupportIssues(idx, "MEMBER", "COUPON", listIssueTypesForCategory("COUPON")).map((i) => i.id);
    expect(ids).not.toContain("COUPON_EXPIRED");
    expect(ids).toContain("OTHER");
  });

  it("이름은 현재 언어 값, 비면 null(코드 기본 이름)", () => {
    const idx = indexSupportCategorySettings([row({ label_ko: "쿠폰 문의", label_en: null })]);
    expect(supportCategorySettingLabel(idx, "ko", "MEMBER", "COUPON")).toBe("쿠폰 문의");
    expect(supportCategorySettingLabel(idx, "en", "MEMBER", "COUPON")).toBeNull();
    expect(supportCategorySettingLabel(idx, "ko", "OWNER", "COUPON")).toBeNull();
  });

  it("숨겨도 서버 접수 판정은 그대로(지난 문의·고정 진입 호환)", () => {
    expect(validateSupportCategoryForOpen({ audience: "MEMBER", category: "COUPON", issueType: "OTHER" }).ok).toBe(true);
  });
});

describe("어드민 저장 입력 검증", () => {
  it("코드에 있는 분야·세부만, 코드로 뺀 「주문」은 어드민 목록에도 없다", () => {
    expect(adminEditableSupportCategories("MEMBER").map((c) => c.id)).not.toContain("ORDER");
    expect(validateSupportCategorySettingInput({ audience: "MEMBER", categoryId: "ORDER" })).toEqual({
      ok: false,
      error: "invalid_category",
    });
    expect(validateSupportCategorySettingInput({ audience: "MEMBER", categoryId: "NOPE" }).ok).toBe(false);
    expect(validateSupportCategorySettingInput({ audience: "MEMBER", categoryId: "COUPON", issueId: "LOGIN" }).ok).toBe(false);
    expect(validateSupportCategorySettingInput({ audience: "X", categoryId: "COUPON" }).ok).toBe(false);
  });

  it("이름 길이·순서 범위, 빈 이름 = null, 「기타」 숨김 금지", () => {
    const ok = validateSupportCategorySettingInput({
      audience: "OWNER",
      categoryId: "SETTLEMENT",
      labelKo: "  정산  문의 ",
      labelEn: "",
      sortOrder: 20,
      hidden: true,
    });
    expect(ok.ok && ok.row).toMatchObject({ label_ko: "정산 문의", label_en: null, sort_order: 20, hidden: true });
    expect(validateSupportCategorySettingInput({ audience: "MEMBER", categoryId: "COUPON", labelKo: "가".repeat(41) }).ok).toBe(false);
    expect(validateSupportCategorySettingInput({ audience: "MEMBER", categoryId: "COUPON", sortOrder: -1 }).ok).toBe(false);
    expect(validateSupportCategorySettingInput({ audience: "MEMBER", categoryId: "OTHER", hidden: true })).toEqual({
      ok: false,
      error: "hide_locked",
    });
    expect(
      validateSupportCategorySettingInput({ audience: "MEMBER", categoryId: "COUPON", issueId: "OTHER", hidden: true }).ok
    ).toBe(false);
    expect(isSupportCategoryHideLocked("COUPON")).toBe(false);
  });
});

describe("연결 — DB 파일·API·어드민 화면·앱", () => {
  it("마이그레이션: 키 유일·RLS·anon/authenticated 접근 없음", () => {
    const sql = read("supabase/migrations/20271110200000_support_category_settings.sql");
    expect(sql).toContain("create table if not exists public.support_category_settings");
    expect(sql).toContain("unique (audience, category_id, issue_id)");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("revoke all on table public.support_category_settings from anon, authenticated");
  });

  it("어드민 API = support 권한 + 입력 검증 + 감사 기록, 표 없음 = 503(저장 불가)", () => {
    const api = read("app/api/admin/support/category-settings/route.ts");
    expect(api.match(/requireAdminPermission\("support"\)/g)?.length).toBe(2);
    expect(api).toContain("validateSupportCategorySettingInput(body)");
    expect(api).toContain("appendAdminRouteAudit(");
    expect(api).toContain('res.error === "missing_table" ? 503');
  });

  it("앱 API = 표시값만·실패 시 빈 목록(코드 기본값)", () => {
    const api = read("app/api/support/category-settings/route.ts");
    expect(api).toContain("const rows = res.ok");
    expect(api).not.toContain("updated_by");
  });

  it("어드민 메뉴·화면·문구", () => {
    expect(existsSync(join(process.cwd(), "app/admin/support/categories/page.tsx"))).toBe(true);
    expect(read("components/admin/admin-menu.ts")).toContain('path: "/admin/support/categories"');
    expect(MESSAGES.ko.admin_menu_cp_support_categories).toBe("문의 유형 관리");
    const page = read("components/admin/support/AdminSupportCategoriesPage.tsx");
    expect(page).toContain("confirmAdminAction({");
    expect(page).toContain("disabled={tableMissing || busy}");
  });

  it("앱 화면은 어드민 이름·순서·숨김을 쓴다(쓰기·내 문의 목록·접수 완료)", () => {
    const v = read("components/support/SupportTicketViews.tsx");
    expect(v).toContain("visibleSupportCategories(");
    expect(v).toContain("visibleSupportIssues(");
    expect(read("components/support/SupportCasesHistoryList.tsx")).toContain("useSupportCategoryLabels()");
    expect(read("components/support/SupportModalHost.tsx")).toContain("labels.categoryLabel(state.audience, state.category)");
  });
});
