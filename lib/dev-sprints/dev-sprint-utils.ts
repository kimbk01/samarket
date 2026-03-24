/**
 * 52단계: 스프린트 / 릴리즈 / 배포 후 검증 라벨 유틸
 */

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

const SPRINT_STATUS_LABELS: Record<DevSprintStatus, string> = {
  planned: "예정",
  active: "진행중",
  completed: "완료",
  archived: "보관",
};

const SPRINT_ITEM_STATUS_LABELS: Record<DevSprintItemStatus, string> = {
  todo: "할 일",
  in_progress: "진행중",
  review: "리뷰",
  qa_ready: "QA 대기",
  done: "완료",
  blocked: "블로킹",
};

const PRIORITY_LABELS: Record<DevSprintItemPriority, string> = {
  low: "낮음",
  medium: "중간",
  high: "높음",
  critical: "긴급",
};

const OWNER_TYPE_LABELS: Record<DevSprintItemOwnerType, string> = {
  dev: "개발",
  ops: "운영",
  shared: "공유",
};

const RELEASE_NOTE_STATUS_LABELS: Record<ReleaseNoteStatus, string> = {
  draft: "초안",
  published: "배포됨",
  archived: "보관",
};

const RELEASE_NOTE_ITEM_TYPE_LABELS: Record<ReleaseNoteItemType, string> = {
  feature: "기능",
  bugfix: "버그수정",
  improvement: "개선",
  ops_change: "운영변경",
  hotfix: "핫픽스",
};

const POST_RELEASE_PHASE_LABELS: Record<PostReleaseCheckPhase, string> = {
  before_release: "배포 전",
  just_after_release: "배포 직후",
  after_24h: "24시간 후",
  after_72h: "72시간 후",
};

const POST_RELEASE_STATUS_LABELS: Record<PostReleaseCheckStatus, string> = {
  todo: "할 일",
  in_progress: "진행중",
  done: "완료",
  blocked: "블로킹",
};

const POST_RELEASE_PRIORITY_LABELS: Record<PostReleaseCheckPriority, string> = {
  low: "낮음",
  medium: "중간",
  high: "높음",
  critical: "긴급",
};

export function getSprintStatusLabel(v: DevSprintStatus): string {
  return SPRINT_STATUS_LABELS[v] ?? v;
}

export function getSprintItemStatusLabel(v: DevSprintItemStatus): string {
  return SPRINT_ITEM_STATUS_LABELS[v] ?? v;
}

export function getSprintItemPriorityLabel(v: DevSprintItemPriority): string {
  return PRIORITY_LABELS[v] ?? v;
}

export function getSprintItemOwnerTypeLabel(v: DevSprintItemOwnerType): string {
  return OWNER_TYPE_LABELS[v] ?? v;
}

export function getReleaseNoteStatusLabel(v: ReleaseNoteStatus): string {
  return RELEASE_NOTE_STATUS_LABELS[v] ?? v;
}

export function getReleaseNoteItemTypeLabel(v: ReleaseNoteItemType): string {
  return RELEASE_NOTE_ITEM_TYPE_LABELS[v] ?? v;
}

export function getPostReleasePhaseLabel(v: PostReleaseCheckPhase): string {
  return POST_RELEASE_PHASE_LABELS[v] ?? v;
}

export function getPostReleaseStatusLabel(v: PostReleaseCheckStatus): string {
  return POST_RELEASE_STATUS_LABELS[v] ?? v;
}

export function getPostReleasePriorityLabel(v: PostReleaseCheckPriority): string {
  return POST_RELEASE_PRIORITY_LABELS[v] ?? v;
}
