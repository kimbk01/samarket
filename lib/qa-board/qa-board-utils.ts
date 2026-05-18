/**
 * 48단계: QA 보드 유틸 (i18n MessageKey)
 */

import type { MessageKey } from "@/lib/i18n/messages";
import type {
  QaTestDomain,
  QaTestCaseStatus,
  QaTestCasePriority,
  QaTestEnvironment,
  QaPilotCategory,
  QaIssueSeverity,
  QaIssueStatus,
  QaGoLiveDecision,
} from "@/lib/types/qa-board";
import {
  QA_CASE_STATUS_KEYS,
  QA_ENV_KEYS,
  QA_ISSUE_STATUS_KEYS,
  QA_PILOT_CATEGORY_KEYS,
  QA_PILOT_STATUS_KEYS,
  QA_PRIORITY_KEYS,
  QA_SEVERITY_KEYS,
  QA_TEST_DOMAIN_KEYS,
} from "@/components/admin/i18n/admin-qa-label-keys";

export type QaBoardTranslate = (
  key: MessageKey,
  params?: Record<string, string | number>
) => string;

export function getDomainLabel(t: QaBoardTranslate, domain: QaTestDomain): string {
  return t(QA_TEST_DOMAIN_KEYS[domain] ?? ("admin_qa_domain_unknown" as MessageKey));
}

export function getCaseStatusLabel(t: QaBoardTranslate, status: QaTestCaseStatus): string {
  return t(QA_CASE_STATUS_KEYS[status]);
}

export function getPriorityLabel(t: QaBoardTranslate, priority: QaTestCasePriority): string {
  return t(QA_PRIORITY_KEYS[priority]);
}

export function getEnvLabel(t: QaBoardTranslate, env: QaTestEnvironment): string {
  return t(QA_ENV_KEYS[env]);
}

export function getPilotCategoryLabel(t: QaBoardTranslate, category: QaPilotCategory): string {
  return t(QA_PILOT_CATEGORY_KEYS[category]);
}

export function getPilotStatusLabel(t: QaBoardTranslate, status: string): string {
  const key = QA_PILOT_STATUS_KEYS[status];
  return key ? t(key) : status;
}

export function getSeverityLabel(t: QaBoardTranslate, severity: QaIssueSeverity): string {
  return t(QA_SEVERITY_KEYS[severity]);
}

export function getIssueStatusLabel(t: QaBoardTranslate, status: QaIssueStatus): string {
  return t(QA_ISSUE_STATUS_KEYS[status]);
}

export function getGoLiveQaLabel(t: QaBoardTranslate, dec: QaGoLiveDecision): string {
  if (dec === "go") return "Go";
  if (dec === "conditional_go") return t("admin_qa_conditional_go");
  return "No-Go";
}
