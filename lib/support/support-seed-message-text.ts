/**
 * 고객센터 시작 메시지 (언어 재감사 2026-11-27 설계 §4-3 · 행 support-case-service.ts:87·412).
 *
 * `support_messages` 에는 종류·값을 둘 열이 없다(DB 열 추가 금지). 그래서 저장은 지금과 글자가 같은
 * 정본 문장(카탈로그 `support_seed_*` 의 ko 값 — 관리자 화면·옛 7행과 호환)으로 두고,
 * 고객 화면은 그 문장을 키 + 값(분야·문의 종류)으로 되돌려 보는 사람 언어로 그린다.
 * 사람이 쓴 첫 메시지는 대응표에 없으므로 그대로 보인다.
 */
import type { AppLanguageCode } from "@/lib/i18n/config";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import { createCatalogTemplateMatcher } from "@/lib/i18n/stored-text-template-match";
import { supportCategoryLabel, supportIssueLabel } from "@/lib/support/support-display-labels";

/** 저장 정본 언어 — 화면 언어가 아니다(열이 없어 기존 저장 글자를 유지하는 값) */
const SUPPORT_SEED_STORED_LANGUAGE: AppLanguageCode = "ko";

export function buildSupportOpenedSeedBody(): string {
  return translate(SUPPORT_SEED_STORED_LANGUAGE, "support_seed_opened");
}

export function buildSupportTriageSeedBody(category: string, issueType: string | null): string {
  const c = category.trim() || "SUPPORT";
  const i = (issueType ?? "").trim();
  return i
    ? translate(SUPPORT_SEED_STORED_LANGUAGE, "support_seed_triage_issue", { category: c, issue: i })
    : translate(SUPPORT_SEED_STORED_LANGUAGE, "support_seed_triage", { category: c });
}

const SEED_KEYS: readonly MessageKey[] = ["support_seed_opened", "support_seed_triage_issue", "support_seed_triage"];
const matchSupportSeed = createCatalogTemplateMatcher(SEED_KEYS);

type SafeT = (
  key: MessageKey,
  opts?: { vars?: Record<string, string | number>; fallbackKo?: string; fallbackEn?: string }
) => string;

/** 고객 화면 말풍선 글 — 시작 메시지면 보는 사람 언어로, 아니면 그대로 */
export function resolveSupportMessageDisplayBody(safeT: SafeT, body: string | null | undefined): string {
  const raw = body ?? "";
  const match = matchSupportSeed(raw);
  if (!match) return raw;
  if (match.key === "support_seed_opened") return safeT("support_seed_opened");
  const category = match.vars.category ?? "";
  const categoryLabel = supportCategoryLabel(safeT, category);
  if (match.key === "support_seed_triage_issue") {
    const issue = supportIssueLabel(safeT, category, match.vars.issue) ?? match.vars.issue ?? "";
    return safeT("support_seed_triage_issue", { vars: { category: categoryLabel, issue } });
  }
  return safeT("support_seed_triage", { vars: { category: categoryLabel } });
}
