import type { MessageKey } from "@/lib/i18n/messages";
import type {
  QaTestDomain,
  QaTestCaseStatus,
  QaTestCasePriority,
  QaTestEnvironment,
  QaPilotCategory,
  QaIssueSeverity,
  QaIssueStatus,
} from "@/lib/types/qa-board";

export const QA_TEST_DOMAIN_KEYS: Record<QaTestDomain, MessageKey> = {
  auth: "admin_qa_domain_auth",
  product: "admin_qa_domain_product",
  feed: "admin_qa_domain_feed",
  chat: "admin_qa_domain_chat",
  moderation: "admin_qa_domain_moderation",
  point_payment: "admin_qa_domain_point_payment",
  ads_business: "admin_qa_domain_ads_business",
  admin_console: "admin_qa_domain_admin_console",
  ops: "admin_qa_domain_ops",
  security: "admin_qa_domain_security",
};

export const QA_CASE_STATUS_KEYS: Record<QaTestCaseStatus, MessageKey> = {
  not_started: "admin_qa_not_started",
  in_progress: "admin_qa_in_progress",
  passed: "admin_qa_passed_2",
  failed: "admin_qa_failed",
  blocked: "admin_qa_blocked",
};

export const QA_PRIORITY_KEYS: Record<QaTestCasePriority, MessageKey> = {
  low: "admin_qa_low",
  medium: "admin_qa_medium",
  high: "admin_qa_high",
  critical: "admin_qa_critical",
};

export const QA_ENV_KEYS: Record<QaTestEnvironment, MessageKey> = {
  local: "admin_qa_env_local",
  staging: "admin_qa_env_staging",
  production_candidate: "admin_production_candidate",
};

export const QA_PILOT_CATEGORY_KEYS: Record<QaPilotCategory, MessageKey> = {
  onboarding: "admin_qa_pilot_onboarding",
  browsing: "admin_qa_pilot_browsing",
  posting: "admin_qa_pilot_posting",
  chat: "admin_qa_pilot_chat",
  reporting: "admin_qa_pilot_reporting",
  points: "admin_qa_pilot_points",
  admin_response: "admin_qa_pilot_admin_response",
};

export const QA_PILOT_STATUS_KEYS: Record<string, MessageKey> = {
  todo: "admin_launch_week_todo",
  in_progress: "admin_qa_in_progress",
  done: "admin_qa_done",
  blocked: "admin_qa_blocked",
};

export const QA_SEVERITY_KEYS: Record<QaIssueSeverity, MessageKey> = {
  low: "admin_qa_low",
  medium: "admin_qa_medium",
  high: "admin_qa_high",
  critical: "admin_qa_critical",
};

export const QA_ISSUE_STATUS_KEYS: Record<QaIssueStatus, MessageKey> = {
  open: "admin_qa_open",
  in_progress: "admin_qa_in_progress",
  fixed: "admin_qa_fixed",
  verified: "admin_qa_verified",
  wont_fix: "admin_qa_wont_fix",
};

export const QA_TABLE_HEADER_KEYS = {
  title: "admin_qa_k078b3a1b",
  status: "admin_qa_status_2",
  priority: "admin_qa_priority",
  area: "admin_qa_area",
  description: "admin_qa_description",
  owner: "admin_qa_owner_label",
  environment: "admin_qa_environment",
  executedAt: "admin_qa_executed_at",
  failReason: "admin_qa_fail_reason",
  link: "admin_qa_link_2",
  severity: "admin_qa_severity",
  linkedTest: "admin_qa_linked_test",
  reproduce: "admin_qa_reproduce",
  notes: "admin_qa_notes",
  category: "admin_qa_category",
  mustPass: "admin_qa_must_pass",
  passRate: "admin_qa_pass_rate",
} as const satisfies Record<string, MessageKey>;

export const QA_TAB_KEYS = {
  overview: "admin_qa_tab_overview",
  cases: "admin_qa_tab_cases",
  pilot: "admin_qa_k692dba38",
  issues: "admin_qa_tab_issues",
  blocker: "admin_qa_tab_blocker",
} as const satisfies Record<string, MessageKey>;
