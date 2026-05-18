/**
 * 52단계: 스프린트 / 릴리즈 / 배포 후 검증 라벨 유틸 (i18n MessageKey)
 */

import type { MessageKey } from "@/lib/i18n/messages";
import type {
  DevSprintStatus,
  DevSprintItemStatus,
  DevSprintItemPriority,
  DevSprintItemOwnerType,
  ReleaseNoteStatus,
  ReleaseNoteItemType,
  PostReleaseCheckPhase,
  PostReleaseCheckStatus,
  PostReleaseCheckPriority,
} from "@/lib/types/dev-sprints";

export type DevSprintTranslate = (
  key: MessageKey,
  params?: Record<string, string | number>
) => string;

const SPRINT_STATUS_KEYS: Record<DevSprintStatus, MessageKey> = {
  planned: "admin_dev_sprint_sprint_planned",
  active: "admin_dev_sprint_sprint_active",
  completed: "admin_dev_sprint_sprint_completed",
  archived: "admin_dev_sprint_sprint_archived",
};

const SPRINT_ITEM_STATUS_KEYS: Record<DevSprintItemStatus, MessageKey> = {
  todo: "admin_dev_sprint_status_todo",
  in_progress: "admin_dev_sprint_status_in_progress",
  review: "admin_dev_sprint_status_review",
  qa_ready: "admin_dev_sprint_status_qa_ready",
  done: "admin_dev_sprint_status_done",
  blocked: "admin_dev_sprint_status_blocked",
};

const PRIORITY_KEYS: Record<DevSprintItemPriority, MessageKey> = {
  low: "admin_dev_sprint_priority_low",
  medium: "admin_dev_sprint_priority_medium",
  high: "admin_dev_sprint_priority_high",
  critical: "admin_dev_sprint_priority_critical",
};

const OWNER_TYPE_KEYS: Record<DevSprintItemOwnerType, MessageKey> = {
  dev: "admin_dev_sprint_owner_dev",
  ops: "admin_dev_sprint_owner_ops",
  shared: "admin_dev_sprint_owner_shared",
};

const RELEASE_NOTE_STATUS_KEYS: Record<ReleaseNoteStatus, MessageKey> = {
  draft: "admin_dev_sprint_release_draft",
  published: "admin_dev_sprint_release_published",
  archived: "admin_dev_sprint_release_archived",
};

const RELEASE_NOTE_ITEM_TYPE_KEYS: Record<ReleaseNoteItemType, MessageKey> = {
  feature: "admin_dev_sprint_release_item_feature",
  bugfix: "admin_dev_sprint_release_item_bugfix",
  improvement: "admin_dev_sprint_release_item_improvement",
  ops_change: "admin_dev_sprint_release_item_ops_change",
  hotfix: "admin_dev_sprint_release_item_hotfix",
};

const POST_RELEASE_PHASE_KEYS: Record<PostReleaseCheckPhase, MessageKey> = {
  before_release: "admin_dev_sprint_post_release_before",
  just_after_release: "admin_dev_sprint_post_release_just_after",
  after_24h: "admin_dev_sprint_post_release_24h",
  after_72h: "admin_dev_sprint_post_release_72h",
};

const POST_RELEASE_STATUS_KEYS: Record<PostReleaseCheckStatus, MessageKey> = {
  todo: "admin_dev_sprint_status_todo",
  in_progress: "admin_dev_sprint_status_in_progress",
  done: "admin_dev_sprint_status_done",
  blocked: "admin_dev_sprint_status_blocked",
};

const POST_RELEASE_PRIORITY_KEYS: Record<PostReleaseCheckPriority, MessageKey> = {
  low: "admin_dev_sprint_priority_low",
  medium: "admin_dev_sprint_priority_medium",
  high: "admin_dev_sprint_priority_high",
  critical: "admin_dev_sprint_priority_critical",
};

export function getSprintStatusLabel(t: DevSprintTranslate, v: DevSprintStatus): string {
  return t(SPRINT_STATUS_KEYS[v] ?? "common_need_check");
}

export function getSprintItemStatusLabel(t: DevSprintTranslate, v: DevSprintItemStatus): string {
  return t(SPRINT_ITEM_STATUS_KEYS[v] ?? "common_need_check");
}

export function getSprintItemPriorityLabel(t: DevSprintTranslate, v: DevSprintItemPriority): string {
  return t(PRIORITY_KEYS[v] ?? "common_need_check");
}

export function getSprintItemOwnerTypeLabel(t: DevSprintTranslate, v: DevSprintItemOwnerType): string {
  return t(OWNER_TYPE_KEYS[v] ?? "common_need_check");
}

export function getReleaseNoteStatusLabel(t: DevSprintTranslate, v: ReleaseNoteStatus): string {
  return t(RELEASE_NOTE_STATUS_KEYS[v] ?? "common_need_check");
}

export function getReleaseNoteItemTypeLabel(t: DevSprintTranslate, v: ReleaseNoteItemType): string {
  return t(RELEASE_NOTE_ITEM_TYPE_KEYS[v] ?? "common_need_check");
}

export function getPostReleasePhaseLabel(t: DevSprintTranslate, v: PostReleaseCheckPhase): string {
  return t(POST_RELEASE_PHASE_KEYS[v] ?? "common_need_check");
}

export function getPostReleaseStatusLabel(t: DevSprintTranslate, v: PostReleaseCheckStatus): string {
  return t(POST_RELEASE_STATUS_KEYS[v] ?? "common_need_check");
}

export function getPostReleasePriorityLabel(t: DevSprintTranslate, v: PostReleaseCheckPriority): string {
  return t(POST_RELEASE_PRIORITY_KEYS[v] ?? "common_need_check");
}
