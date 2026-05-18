import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import type {
  ReleaseArchiveChangeType,
  ReleaseArchiveStatus,
  RegressionCategory,
  RegressionIssueSeverity,
  RegressionIssueStatus,
} from "@/lib/types/release-archive";

function raT(key: MessageKey): string {
  return translate(getRuntimeAppLanguage(), key);
}

const STATUS_KEYS: Record<ReleaseArchiveStatus, MessageKey> = {
  active: "ra_status_active",
  stable: "ra_status_stable",
  deprecated: "ra_status_deprecated",
  rolled_back: "ra_status_rolled_back",
  hotfix: "ra_status_hotfix",
};

const CHANGE_KEYS: Record<ReleaseArchiveChangeType, MessageKey> = {
  feature: "ra_change_feature",
  improvement: "ra_change_improvement",
  bugfix: "ra_change_bugfix",
  hotfix: "ra_change_hotfix",
  ops_change: "ra_change_ops",
  config_change: "ra_change_config",
};

const SEVERITY_KEYS: Record<RegressionIssueSeverity, MessageKey> = {
  low: "ra_sev_low",
  medium: "ra_sev_medium",
  high: "ra_sev_high",
  critical: "ra_sev_critical",
};

const REG_STATUS_KEYS: Record<RegressionIssueStatus, MessageKey> = {
  detected: "ra_reg_detected",
  investigating: "ra_reg_investigating",
  confirmed: "ra_reg_confirmed",
  fixed: "ra_reg_fixed",
  verified: "ra_reg_verified",
  archived: "ra_reg_archived",
};

const CATEGORY_KEYS: Record<RegressionCategory, MessageKey> = {
  auth: "ra_cat_auth",
  product: "ra_cat_product",
  feed: "ra_cat_feed",
  chat: "ra_cat_chat",
  moderation: "ra_cat_moderation",
  points: "ra_cat_points",
  ads: "ra_cat_ads",
  admin: "ra_cat_admin",
  ops: "ra_cat_ops",
};

export function getReleaseStatusLabel(v: ReleaseArchiveStatus): string {
  const key = STATUS_KEYS[v];
  return key ? raT(key) : v;
}

export function getChangeTypeLabel(v: ReleaseArchiveChangeType): string {
  const key = CHANGE_KEYS[v];
  return key ? raT(key) : v;
}

export function getRegressionSeverityLabel(v: RegressionIssueSeverity): string {
  const key = SEVERITY_KEYS[v];
  return key ? raT(key) : v;
}

export function getRegressionStatusLabel(v: RegressionIssueStatus): string {
  const key = REG_STATUS_KEYS[v];
  return key ? raT(key) : v;
}

export function getRegressionCategoryLabel(v: RegressionCategory): string {
  const key = CATEGORY_KEYS[v];
  return key ? raT(key) : v;
}
