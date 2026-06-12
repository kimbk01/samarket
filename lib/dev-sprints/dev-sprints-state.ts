/**
 * 개발 스프린트 / 릴리즈 노트 / 배포 후 검증 — 단일 저장소.
 * 영속화: `dev-sprints-db` + `/api/admin/dev-sprints`
 */
import type {
  DevSprint,
  DevSprintStatus,
  DevSprintItem,
  DevSprintItemStatus,
  ReleaseNote,
  ReleaseNoteStatus,
  ReleaseNoteItem,
  PostReleaseCheck,
  PostReleaseCheckPhase,
  PostReleaseCheckStatus,
} from "@/lib/types/dev-sprints";

function isoNow() {
  return new Date().toISOString();
}

function defaultSprints(): DevSprint[] {
  const now = isoNow();
  const thisMonth = now.slice(0, 7);
  const nextMonth = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 7);

  return [
    {
      id: "ds-1",
      sprintName: "Sprint 24-03",
      sprintGoal: "피드 깜빡임·채팅 알림 개선",
      startDate: thisMonth + "-01",
      endDate: thisMonth + "-14",
      status: "active" as DevSprintStatus,
      ownerAdminId: "admin1",
      ownerAdminNickname: "관리자",
      createdAt: new Date(Date.now() - 14 * 86400000).toISOString(),
      updatedAt: now,
      note: "sprint handoff note placeholder",
    },
    {
      id: "ds-2",
      sprintName: "Sprint 24-02",
      sprintGoal: "신고 알림·포인트 필터",
      startDate: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
      endDate: new Date(Date.now() - 16 * 86400000).toISOString().slice(0, 10),
      status: "completed" as DevSprintStatus,
      ownerAdminId: "admin1",
      ownerAdminNickname: "관리자",
      createdAt: new Date(Date.now() - 45 * 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 15 * 86400000).toISOString(),
      note: "",
    },
    {
      id: "ds-3",
      sprintName: "Sprint 24-04",
      sprintGoal: "다음 스프린트 placeholder",
      startDate: nextMonth + "-01",
      endDate: nextMonth + "-14",
      status: "planned" as DevSprintStatus,
      ownerAdminId: null,
      ownerAdminNickname: null,
      createdAt: now,
      updatedAt: now,
      note: "",
    },
  ];
}

function defaultSprintItems(): DevSprintItem[] {
  const now = isoNow();

  return [
    {
      id: "dsi-1",
      sprintId: "ds-1",
      backlogItemId: "pbi-1",
      title: "피드 무한스크롤 깜빡임 개선",
      description: "스크롤 시 리스트 깜빡임 제거",
      status: "in_progress",
      priority: "high",
      ownerType: "dev",
      ownerName: "개발 placeholder",
      linkedQaIssueId: "qai-1",
      linkedActionItemId: null,
      linkedDeploymentId: null,
      estimatePoint: 5,
      completedAt: null,
      blockerReason: null,
      createdAt: new Date(Date.now() - 10 * 86400000).toISOString(),
      updatedAt: now,
    },
    {
      id: "dsi-2",
      sprintId: "ds-1",
      backlogItemId: "pbi-3",
      title: "채팅 알림 수신 안정화",
      description: "알림 설정 반영 및 FCM 검증",
      status: "blocked",
      priority: "critical",
      ownerType: "shared",
      ownerName: "개발 placeholder",
      linkedQaIssueId: null,
      linkedActionItemId: null,
      linkedDeploymentId: null,
      estimatePoint: 8,
      completedAt: null,
      blockerReason: "FCM 토큰 갱신 이슈 확인 중",
      createdAt: new Date(Date.now() - 8 * 86400000).toISOString(),
      updatedAt: now,
    },
    {
      id: "dsi-3",
      sprintId: "ds-1",
      backlogItemId: "pbi-2",
      title: "상품 사진 업로드 성능 개선",
      description: "이미지 업로드 대기 시간 단축",
      status: "todo",
      priority: "high",
      ownerType: "dev",
      ownerName: "개발 placeholder",
      linkedQaIssueId: null,
      linkedActionItemId: null,
      linkedDeploymentId: null,
      estimatePoint: 5,
      completedAt: null,
      blockerReason: null,
      createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
      updatedAt: now,
    },
    {
      id: "dsi-4",
      sprintId: "ds-2",
      backlogItemId: "pbi-5",
      title: "신고 처리 결과 알림",
      description: "신고 접수/처리 결과 푸시 알림",
      status: "done",
      priority: "high",
      ownerType: "dev",
      ownerName: "개발 placeholder",
      linkedQaIssueId: null,
      linkedActionItemId: "act-1",
      linkedDeploymentId: "dep-1",
      estimatePoint: 4,
      completedAt: new Date(Date.now() - 3 * 86400000).toISOString(),
      blockerReason: null,
      createdAt: new Date(Date.now() - 20 * 86400000).toISOString(),
      updatedAt: now,
    },
  ];
}

function defaultReleaseNotes(): ReleaseNote[] {
  const now = isoNow();

  return [
    {
      id: "rn-1",
      releaseVersion: "1.2.0",
      buildTag: "1.2.0.42",
      title: "v1.2.0 - 신고 알림·안정화",
      summary: "신고 처리 결과 알림 추가, 피드·채팅 안정화",
      includedSprintId: "ds-2",
      status: "published",
      releaseDate: new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10),
      createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
      updatedAt: now,
      createdByAdminId: "admin1",
      createdByAdminNickname: "관리자",
    },
    {
      id: "rn-2",
      releaseVersion: "1.3.0",
      buildTag: "1.3.0.0",
      title: "v1.3.0 - 피드·채팅 개선 (예정)",
      summary: "피드 깜빡임 개선, 채팅 알림 안정화",
      includedSprintId: "ds-1",
      status: "draft",
      releaseDate: null,
      createdAt: now,
      updatedAt: now,
      createdByAdminId: "admin1",
      createdByAdminNickname: "관리자",
    },
  ];
}

function defaultReleaseNoteItems(): ReleaseNoteItem[] {
  const now = isoNow();

  return [
    {
      id: "rni-1",
      releaseNoteId: "rn-1",
      itemType: "feature",
      title: "신고 처리 결과 알림",
      description: "신고 접수·처리 시 푸시 알림 발송",
      linkedBacklogItemId: "pbi-5",
      linkedSprintItemId: "dsi-4",
      linkedQaIssueId: null,
      linkedDeploymentId: "dep-1",
      sortOrder: 1,
      createdAt: now,
    },
    {
      id: "rni-2",
      releaseNoteId: "rn-1",
      itemType: "improvement",
      title: "앱 안정성 개선",
      description: "일부 크래시 수정",
      linkedBacklogItemId: null,
      linkedSprintItemId: null,
      linkedQaIssueId: null,
      linkedDeploymentId: null,
      sortOrder: 2,
      createdAt: now,
    },
    {
      id: "rni-3",
      releaseNoteId: "rn-2",
      itemType: "bugfix",
      title: "피드 무한스크롤 깜빡임 수정",
      description: "스크롤 시 리스트 깜빡임 제거",
      linkedBacklogItemId: "pbi-1",
      linkedSprintItemId: "dsi-1",
      linkedQaIssueId: "qai-1",
      linkedDeploymentId: null,
      sortOrder: 1,
      createdAt: now,
    },
    {
      id: "rni-4",
      releaseNoteId: "rn-2",
      itemType: "feature",
      title: "채팅 알림 안정화",
      description: "FCM·권한 반영 개선",
      linkedBacklogItemId: "pbi-3",
      linkedSprintItemId: "dsi-2",
      linkedQaIssueId: null,
      linkedDeploymentId: null,
      sortOrder: 2,
      createdAt: now,
    },
  ];
}

function defaultPostReleaseChecks(): PostReleaseCheck[] {
  const now = isoNow();

  return [
    {
      id: "prc-1",
      releaseVersion: "1.2.0",
      phase: "before_release",
      title: "스테이징 스모크 테스트",
      description: "주요 플로우 동작 확인",
      status: "done",
      priority: "critical",
      linkedType: "deployment",
      linkedId: "dep-1",
      ownerAdminId: "admin1",
      ownerAdminNickname: "관리자",
      checkedAt: new Date(Date.now() - 3 * 86400000).toISOString(),
      blockerReason: null,
      note: "",
      updatedAt: now,
    },
    {
      id: "prc-2",
      releaseVersion: "1.2.0",
      phase: "just_after_release",
      title: "프로덕션 헬스체크",
      description: "API·추천 서비스 응답 확인",
      status: "done",
      priority: "critical",
      linkedType: null,
      linkedId: null,
      ownerAdminId: "admin1",
      ownerAdminNickname: "관리자",
      checkedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      blockerReason: null,
      note: "",
      updatedAt: now,
    },
    {
      id: "prc-3",
      releaseVersion: "1.2.0",
      phase: "after_24h",
      title: "에러율·지표 점검",
      description: "24시간 에러율·지연률 확인",
      status: "done",
      priority: "high",
      linkedType: null,
      linkedId: null,
      ownerAdminId: null,
      ownerAdminNickname: null,
      checkedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
      blockerReason: null,
      note: "",
      updatedAt: now,
    },
    {
      id: "prc-4",
      releaseVersion: "1.2.0",
      phase: "after_72h",
      title: "72시간 회귀 이슈 확인",
      description: "신규 이슈·회귀 버그 없음 확인",
      status: "todo",
      priority: "high",
      linkedType: null,
      linkedId: null,
      ownerAdminId: null,
      ownerAdminNickname: null,
      checkedAt: null,
      blockerReason: null,
      note: "",
      updatedAt: now,
    },
    {
      id: "prc-5",
      releaseVersion: "1.3.0",
      phase: "before_release",
      title: "1.3.0 RC 검증",
      description: "release candidate 스모크 테스트",
      status: "in_progress",
      priority: "critical",
      linkedType: null,
      linkedId: null,
      ownerAdminId: null,
      ownerAdminNickname: null,
      checkedAt: null,
      blockerReason: null,
      note: "hotfix placeholder 분기 구조 확장 가능",
      updatedAt: now,
    },
  ];
}

const SPRINTS: DevSprint[] = defaultSprints();
const SPRINT_ITEMS: DevSprintItem[] = defaultSprintItems();
const RELEASE_NOTES: ReleaseNote[] = defaultReleaseNotes();
const RELEASE_NOTE_ITEMS: ReleaseNoteItem[] = defaultReleaseNoteItems();
const POST_RELEASE_CHECKS: PostReleaseCheck[] = defaultPostReleaseChecks();

export type DevSprintsBundleV1 = {
  version: 1;
  sprints: DevSprint[];
  sprintItems: DevSprintItem[];
  releaseNotes: ReleaseNote[];
  releaseNoteItems: ReleaseNoteItem[];
  postReleaseChecks: PostReleaseCheck[];
};

function replaceArray<T>(target: T[], next: T[]) {
  target.length = 0;
  target.push(...next);
}

export function createDefaultDevSprintsBundle(): DevSprintsBundleV1 {
  return {
    version: 1,
    sprints: defaultSprints().map((s) => ({ ...s })),
    sprintItems: defaultSprintItems().map((i) => ({ ...i })),
    releaseNotes: defaultReleaseNotes().map((n) => ({ ...n })),
    releaseNoteItems: defaultReleaseNoteItems().map((i) => ({ ...i })),
    postReleaseChecks: defaultPostReleaseChecks().map((c) => ({ ...c })),
  };
}

export function importDevSprintsBundle(bundle: DevSprintsBundleV1): void {
  if (bundle.version !== 1) return;
  replaceArray(SPRINTS, (bundle.sprints ?? []).map((s) => ({ ...s })));
  replaceArray(SPRINT_ITEMS, (bundle.sprintItems ?? []).map((i) => ({ ...i })));
  replaceArray(RELEASE_NOTES, (bundle.releaseNotes ?? []).map((n) => ({ ...n })));
  replaceArray(
    RELEASE_NOTE_ITEMS,
    (bundle.releaseNoteItems ?? []).map((i) => ({ ...i }))
  );
  replaceArray(
    POST_RELEASE_CHECKS,
    (bundle.postReleaseChecks ?? []).map((c) => ({ ...c }))
  );
  if (!SPRINTS.length) replaceArray(SPRINTS, defaultSprints());
  if (!SPRINT_ITEMS.length) replaceArray(SPRINT_ITEMS, defaultSprintItems());
  if (!RELEASE_NOTES.length) replaceArray(RELEASE_NOTES, defaultReleaseNotes());
  if (!RELEASE_NOTE_ITEMS.length)
    replaceArray(RELEASE_NOTE_ITEMS, defaultReleaseNoteItems());
  if (!POST_RELEASE_CHECKS.length)
    replaceArray(POST_RELEASE_CHECKS, defaultPostReleaseChecks());
}

export function exportDevSprintsBundle(): DevSprintsBundleV1 {
  return {
    version: 1,
    sprints: SPRINTS.map((s) => ({ ...s })),
    sprintItems: SPRINT_ITEMS.map((i) => ({ ...i })),
    releaseNotes: RELEASE_NOTES.map((n) => ({ ...n })),
    releaseNoteItems: RELEASE_NOTE_ITEMS.map((i) => ({ ...i })),
    postReleaseChecks: POST_RELEASE_CHECKS.map((c) => ({ ...c })),
  };
}

/* ─── sprints ───────────────────────────────────────────────── */

export function getDevSprints(filters?: {
  status?: DevSprintStatus;
}): DevSprint[] {
  let list = [...SPRINTS].sort(
    (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
  );
  if (filters?.status) list = list.filter((s) => s.status === filters.status);
  return list;
}

export function getDevSprintById(id: string): DevSprint | undefined {
  return SPRINTS.find((s) => s.id === id);
}

/* ─── sprint items ──────────────────────────────────────────── */

export function getDevSprintItems(filters?: {
  sprintId?: string;
  status?: DevSprintItemStatus;
}): DevSprintItem[] {
  let list = [...SPRINT_ITEMS].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  if (filters?.sprintId) list = list.filter((i) => i.sprintId === filters.sprintId);
  if (filters?.status) list = list.filter((i) => i.status === filters.status);
  return list;
}

export function getDevSprintItemById(id: string): DevSprintItem | undefined {
  return SPRINT_ITEMS.find((i) => i.id === id);
}

/* ─── release notes ─────────────────────────────────────────── */

export function getReleaseNotes(filters?: {
  status?: ReleaseNoteStatus;
  releaseVersion?: string;
}): ReleaseNote[] {
  let list = [...RELEASE_NOTES].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  if (filters?.status) list = list.filter((n) => n.status === filters.status);
  if (filters?.releaseVersion)
    list = list.filter((n) => n.releaseVersion === filters.releaseVersion);
  return list;
}

export function getReleaseNoteById(id: string): ReleaseNote | undefined {
  return RELEASE_NOTES.find((n) => n.id === id);
}

/* ─── release note items ────────────────────────────────────── */

export function getReleaseNoteItems(releaseNoteId: string): ReleaseNoteItem[] {
  return RELEASE_NOTE_ITEMS.filter((i) => i.releaseNoteId === releaseNoteId).sort(
    (a, b) => a.sortOrder - b.sortOrder
  );
}

export function getReleaseNoteItemById(id: string): ReleaseNoteItem | undefined {
  return RELEASE_NOTE_ITEMS.find((i) => i.id === id);
}

/* ─── post-release checks ───────────────────────────────────── */

export function getPostReleaseChecks(filters?: {
  releaseVersion?: string;
  phase?: PostReleaseCheckPhase;
  status?: PostReleaseCheckStatus;
}): PostReleaseCheck[] {
  let list = [...POST_RELEASE_CHECKS].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  if (filters?.releaseVersion)
    list = list.filter((c) => c.releaseVersion === filters.releaseVersion);
  if (filters?.phase) list = list.filter((c) => c.phase === filters.phase);
  if (filters?.status) list = list.filter((c) => c.status === filters.status);
  return list;
}

export function getPostReleaseChecksByVersion(
  releaseVersion: string
): PostReleaseCheck[] {
  return getPostReleaseChecks({ releaseVersion });
}
