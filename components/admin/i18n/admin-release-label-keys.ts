import type { MessageKey } from "@/lib/i18n/messages";
import type {
  ReleaseNoteStatus,
  ReleaseNoteItemType,
  PostReleaseCheckPhase,
  PostReleaseCheckStatus,
  PostReleaseCheckPriority,
} from "@/lib/types/dev-sprints";
import type {
  ReleaseArchiveStatus,
  ReleaseArchiveChangeType,
  RegressionIssueSeverity,
  RegressionIssueStatus,
  RegressionCategory,
} from "@/lib/types/release-archive";

export const RELEASE_NOTE_STATUS_KEYS: Record<ReleaseNoteStatus, MessageKey> = {
  draft: "admin_rel_status_draft",
  published: "admin_rel_status_published",
  archived: "admin_rel_status_archived",
};

export const RELEASE_NOTE_ITEM_TYPE_KEYS: Record<ReleaseNoteItemType, MessageKey> = {
  feature: "admin_rel_type_feature",
  bugfix: "admin_rel_type_bugfix",
  improvement: "admin_rel_type_improvement",
  ops_change: "admin_rel_type_ops",
  hotfix: "admin_rel_type_hotfix",
};

export const POST_RELEASE_PHASE_KEYS: Record<PostReleaseCheckPhase, MessageKey> = {
  before_release: "admin_rel_stage_before",
  just_after_release: "admin_rel_stage_just_after",
  after_24h: "admin_rel_stage_24h",
  after_72h: "admin_rel_stage_72h",
};

export const POST_RELEASE_STATUS_KEYS: Record<PostReleaseCheckStatus, MessageKey> = {
  todo: "admin_rel_status_todo",
  in_progress: "admin_rel_status_in_progress",
  done: "admin_rel_status_done",
  blocked: "admin_rel_status_blocked",
};

export const POST_RELEASE_PRIORITY_KEYS: Record<PostReleaseCheckPriority, MessageKey> = {
  low: "admin_rel_priority_low",
  medium: "admin_rel_priority_medium",
  high: "admin_rel_priority_high",
  critical: "admin_rel_priority_critical",
};

export const RELEASE_ARCHIVE_STATUS_KEYS: Record<ReleaseArchiveStatus, MessageKey> = {
  active: "admin_rel_vstatus_active",
  stable: "admin_rel_vstatus_stable",
  deprecated: "admin_rel_vstatus_deprecated",
  rolled_back: "admin_rel_vstatus_rolled_back",
  hotfix: "admin_rel_vstatus_hotfix",
};

export const CHANGE_TYPE_KEYS: Record<ReleaseArchiveChangeType, MessageKey> = {
  feature: "admin_rel_type_feature",
  improvement: "admin_rel_type_improvement",
  bugfix: "admin_rel_type_bugfix",
  hotfix: "admin_rel_type_hotfix",
  ops_change: "admin_rel_type_ops",
  config_change: "admin_rel_type_config",
};

export const REGRESSION_STATUS_KEYS: Record<RegressionIssueStatus, MessageKey> = {
  detected: "admin_rel_reg_detected",
  investigating: "admin_rel_reg_investigating",
  confirmed: "admin_rel_reg_confirmed",
  fixed: "admin_rel_reg_fixed",
  verified: "admin_rel_reg_verified",
  archived: "admin_rel_reg_archived",
};

export const REGRESSION_CATEGORY_KEYS: Record<RegressionCategory, MessageKey> = {
  auth: "admin_rel_cat_auth",
  product: "admin_rel_cat_product",
  feed: "admin_rel_cat_feed",
  chat: "admin_rel_cat_chat",
  moderation: "admin_rel_cat_moderation",
  points: "admin_rel_cat_points",
  ads: "admin_rel_cat_ads",
  admin: "admin_rel_cat_admin",
  ops: "admin_rel_cat_ops",
};

export const REGRESSION_SEVERITY_KEYS: Record<RegressionIssueSeverity, MessageKey> = {
  low: "admin_rel_priority_low",
  medium: "admin_rel_priority_medium",
  high: "admin_rel_priority_high",
  critical: "admin_rel_priority_critical",
};
