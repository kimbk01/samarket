/**
 * 고객센터 문의 유형 어드민 설정 (접수형 3단계 · Owner 「3단계 진행」 2026-11-10).
 *
 * - 분야·세부의 **정의**(id·대상·서버 판정)는 `support-category-registry.ts` 코드가 SSOT.
 * - 어드민이 바꾸는 값만 `support_category_settings` 표에 덮어쓴다: 이름(ko/en) · 순서 · 앱 노출(숨기기).
 * - 「숨기기」= 고객 분야·세부 **선택 목록**에서만 빠진다. 서버 접수 판정·지난 문의·주문 화면 같은 고정 진입은 그대로.
 * - 「기타」 분야와 각 분야의 「기타」 세부는 숨길 수 없다(고객이 고를 곳이 항상 남게).
 * - 표가 없거나 읽기 실패 = 행 없음 = 코드 기본값 그대로(fail-soft).
 */

import {
  listIssueTypesForCategory,
  listSelectableSupportCategories,
  type SupportAudience,
  type SupportCategoryDefinition,
  type SupportIssueDefinition,
} from "@/lib/support/support-category-registry";

export type SupportCategorySettingRow = {
  audience: SupportAudience;
  category_id: string;
  /** '' = 분야 자체 */
  issue_id: string;
  label_ko: string | null;
  label_en: string | null;
  sort_order: number | null;
  hidden: boolean;
  updated_at?: string | null;
};

export const SUPPORT_CATEGORY_LABEL_KO_MAX = 40;
export const SUPPORT_CATEGORY_LABEL_EN_MAX = 60;
export const SUPPORT_CATEGORY_SORT_MAX = 9999;

/** 고객 화면에서 코드로 이미 빼 둔 분야(어드민 목록에도 보이지 않는다) — 주문 문제는 매장으로 */
export const SUPPORT_CATEGORY_CODE_HIDDEN_MEMBER: readonly string[] = ["ORDER"];

export function supportCategorySettingKey(audience: SupportAudience, categoryId: string, issueId = ""): string {
  return `${audience}|${categoryId}|${issueId}`;
}

export type SupportCategorySettingsIndex = ReadonlyMap<string, SupportCategorySettingRow>;

export function indexSupportCategorySettings(
  rows: readonly SupportCategorySettingRow[] | null | undefined
): SupportCategorySettingsIndex {
  const m = new Map<string, SupportCategorySettingRow>();
  for (const r of rows ?? []) {
    if (!r || (r.audience !== "MEMBER" && r.audience !== "OWNER")) continue;
    m.set(supportCategorySettingKey(r.audience, r.category_id, r.issue_id ?? ""), r);
  }
  return m;
}

/** 숨길 수 없는 항목 — 「기타」 분야, 모든 분야의 「기타」 세부 */
export function isSupportCategoryHideLocked(categoryId: string, issueId = ""): boolean {
  if (!issueId) return categoryId === "OTHER";
  return issueId === "OTHER";
}

/** 어드민 설정 이름(현재 언어) — 없으면 null(코드 기본 이름 사용) */
export function supportCategorySettingLabel(
  index: SupportCategorySettingsIndex,
  language: string,
  audience: SupportAudience,
  categoryId: string,
  issueId = ""
): string | null {
  const row = index.get(supportCategorySettingKey(audience, categoryId, issueId));
  if (!row) return null;
  const v = language === "ko" ? row.label_ko : row.label_en;
  return v && v.trim() ? v.trim() : null;
}

function sortWith<T>(items: readonly T[], keyOf: (item: T, i: number) => number): T[] {
  return items
    .map((item, i) => ({ item, i, k: keyOf(item, i) }))
    .sort((a, b) => a.k - b.k || a.i - b.i)
    .map((x) => x.item);
}

/** 어드민 순서 적용 — 순서 값이 없는 항목은 코드 순서 자리(×10)를 쓴다. 「기타」는 항상 맨 뒤. */
export function orderSupportCategories<T extends { id: string }>(
  index: SupportCategorySettingsIndex,
  audience: SupportAudience,
  defs: readonly T[]
): T[] {
  return sortWith(defs, (d, i) => {
    if (d.id === "OTHER") return Number.MAX_SAFE_INTEGER;
    const row = index.get(supportCategorySettingKey(audience, d.id));
    return row?.sort_order ?? i * 10;
  });
}

export function orderSupportIssues<T extends { id: string }>(
  index: SupportCategorySettingsIndex,
  audience: SupportAudience,
  categoryId: string,
  issues: readonly T[]
): T[] {
  return sortWith(issues, (d, i) => {
    if (d.id === "OTHER") return Number.MAX_SAFE_INTEGER;
    const row = index.get(supportCategorySettingKey(audience, categoryId, d.id));
    return row?.sort_order ?? i * 10;
  });
}

/** 고객 선택 목록 — 순서 적용 + 숨김 제외 */
export function visibleSupportCategories(
  index: SupportCategorySettingsIndex,
  audience: SupportAudience,
  defs: readonly SupportCategoryDefinition[]
): SupportCategoryDefinition[] {
  return orderSupportCategories(index, audience, defs).filter(
    (d) => isSupportCategoryHideLocked(d.id) || !index.get(supportCategorySettingKey(audience, d.id))?.hidden
  );
}

export function visibleSupportIssues(
  index: SupportCategorySettingsIndex,
  audience: SupportAudience,
  categoryId: string,
  issues: readonly SupportIssueDefinition[]
): SupportIssueDefinition[] {
  return orderSupportIssues(index, audience, categoryId, issues).filter(
    (d) =>
      isSupportCategoryHideLocked(categoryId, d.id) ||
      !index.get(supportCategorySettingKey(audience, categoryId, d.id))?.hidden
  );
}

/** 어드민이 다룰 수 있는 분야 = 그 대상의 선택 가능 분야(코드로 뺀 「주문」 제외) */
export function adminEditableSupportCategories(audience: SupportAudience): readonly SupportCategoryDefinition[] {
  const all = listSelectableSupportCategories(audience);
  if (audience !== "MEMBER") return all;
  return all.filter((c) => !SUPPORT_CATEGORY_CODE_HIDDEN_MEMBER.includes(c.id));
}

export type SupportCategorySettingInput = {
  audience?: unknown;
  categoryId?: unknown;
  issueId?: unknown;
  labelKo?: unknown;
  labelEn?: unknown;
  sortOrder?: unknown;
  hidden?: unknown;
};

function cleanLabel(v: unknown, max: number): { ok: true; value: string | null } | { ok: false } {
  if (v == null) return { ok: true, value: null };
  if (typeof v !== "string") return { ok: false };
  const t = v.replace(/\s+/g, " ").trim();
  if (!t) return { ok: true, value: null };
  if (t.length > max) return { ok: false };
  return { ok: true, value: t };
}

/** 어드민 저장 입력 검증 — 코드에 있는 분야·세부만, 이름 길이, 순서 범위, 「기타」 숨김 금지 */
export function validateSupportCategorySettingInput(
  input: SupportCategorySettingInput
): { ok: true; row: SupportCategorySettingRow } | { ok: false; error: string } {
  const audience = input.audience === "OWNER" ? "OWNER" : input.audience === "MEMBER" ? "MEMBER" : null;
  if (!audience) return { ok: false, error: "invalid_audience" };
  const categoryId = typeof input.categoryId === "string" ? input.categoryId.trim() : "";
  if (!adminEditableSupportCategories(audience).some((c) => c.id === categoryId)) {
    return { ok: false, error: "invalid_category" };
  }
  const issueId = typeof input.issueId === "string" ? input.issueId.trim() : "";
  if (issueId && !listIssueTypesForCategory(categoryId).some((i) => i.id === issueId)) {
    return { ok: false, error: "invalid_issue_type" };
  }
  const ko = cleanLabel(input.labelKo, SUPPORT_CATEGORY_LABEL_KO_MAX);
  if (!ko.ok) return { ok: false, error: "invalid_label_ko" };
  const en = cleanLabel(input.labelEn, SUPPORT_CATEGORY_LABEL_EN_MAX);
  if (!en.ok) return { ok: false, error: "invalid_label_en" };
  let sort: number | null = null;
  if (input.sortOrder != null && input.sortOrder !== "") {
    const n = Number(input.sortOrder);
    if (!Number.isInteger(n) || n < 0 || n > SUPPORT_CATEGORY_SORT_MAX) return { ok: false, error: "invalid_sort_order" };
    sort = n;
  }
  const hidden = input.hidden === true;
  if (hidden && isSupportCategoryHideLocked(categoryId, issueId)) return { ok: false, error: "hide_locked" };
  return {
    ok: true,
    row: {
      audience,
      category_id: categoryId,
      issue_id: issueId,
      label_ko: ko.value,
      label_en: en.value,
      sort_order: sort,
      hidden,
    },
  };
}
