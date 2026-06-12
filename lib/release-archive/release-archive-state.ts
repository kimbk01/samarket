/**
 * 릴리즈 아카이브 — 버전·변경·회귀·학습 메모 단일 저장소.
 * 영속화: `release-archive-db` + `/api/admin/release-archive`
 */
import type {
  ReleaseArchive,
  ReleaseArchiveStatus,
  ReleaseArchiveItem,
  ReleaseArchiveChangeType,
  ReleaseRegressionIssue,
  RegressionIssueStatus,
  RegressionCategory,
  ReleaseLearningNote,
} from "@/lib/types/release-archive";

function isoNow() {
  return new Date().toISOString();
}

function defaultArchives(): ReleaseArchive[] {
  const now = isoNow();
  return [
    {
      id: "ra-1",
      releaseVersion: "1.2.0",
      buildTag: "1.2.0.42",
      releaseTitle: "v1.2.0 - 신고 알림·안정화",
      releaseStatus: "stable" as ReleaseArchiveStatus,
      releaseDate: new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10),
      summary: "신고 처리 결과 알림 추가, 피드·채팅 안정화",
      linkedSprintId: "ds-2",
      linkedDeploymentId: "dep-1",
      linkedReleaseNoteId: "rn-1",
      createdAt: new Date(Date.now() - 20 * 86400000).toISOString(),
      updatedAt: now,
      note: "",
    },
    {
      id: "ra-2",
      releaseVersion: "1.3.0",
      buildTag: "1.3.0.10",
      releaseTitle: "v1.3.0 - 피드·채팅 개선",
      releaseStatus: "active" as ReleaseArchiveStatus,
      releaseDate: new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10),
      summary: "피드 깜빡임 개선, 채팅 알림 안정화",
      linkedSprintId: "ds-1",
      linkedDeploymentId: null,
      linkedReleaseNoteId: "rn-2",
      createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
      updatedAt: now,
      note: "",
    },
    {
      id: "ra-3",
      releaseVersion: "1.1.0",
      buildTag: "1.1.0.100",
      releaseTitle: "v1.1.0 (롤백됨)",
      releaseStatus: "rolled_back" as ReleaseArchiveStatus,
      releaseDate: new Date(Date.now() - 45 * 86400000).toISOString().slice(0, 10),
      summary: "일부 기능 롤백으로 1.2.0으로 대체",
      linkedSprintId: null,
      linkedDeploymentId: null,
      linkedReleaseNoteId: null,
      createdAt: new Date(Date.now() - 50 * 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 40 * 86400000).toISOString(),
      note: "회귀 다수로 롤백",
    },
  ];
}

function defaultArchiveItems(): ReleaseArchiveItem[] {
  const now = isoNow();
  return [
    {
      id: "rai-1",
      releaseArchiveId: "ra-1",
      changeType: "feature",
      title: "신고 처리 결과 알림",
      description: "신고 접수·처리 시 푸시 알림",
      linkedBacklogItemId: "pbi-5",
      linkedSprintItemId: "dsi-4",
      linkedQaIssueId: null,
      linkedDeploymentId: "dep-1",
      linkedActionItemId: "act-1",
      sortOrder: 1,
      createdAt: now,
    },
    {
      id: "rai-2",
      releaseArchiveId: "ra-1",
      changeType: "improvement",
      title: "앱 안정성 개선",
      description: "일부 크래시 수정",
      linkedBacklogItemId: null,
      linkedSprintItemId: null,
      linkedQaIssueId: null,
      linkedDeploymentId: null,
      linkedActionItemId: null,
      sortOrder: 2,
      createdAt: now,
    },
    {
      id: "rai-3",
      releaseArchiveId: "ra-2",
      changeType: "bugfix",
      title: "피드 무한스크롤 깜빡임 수정",
      description: "스크롤 시 리스트 깜빡임 제거",
      linkedBacklogItemId: "pbi-1",
      linkedSprintItemId: "dsi-1",
      linkedQaIssueId: "qai-1",
      linkedDeploymentId: null,
      linkedActionItemId: null,
      sortOrder: 1,
      createdAt: now,
    },
    {
      id: "rai-4",
      releaseArchiveId: "ra-2",
      changeType: "feature",
      title: "채팅 알림 안정화",
      description: "FCM·권한 반영 개선",
      linkedBacklogItemId: "pbi-3",
      linkedSprintItemId: "dsi-2",
      linkedQaIssueId: null,
      linkedDeploymentId: null,
      linkedActionItemId: null,
      sortOrder: 2,
      createdAt: now,
    },
  ];
}

function defaultRegressionIssues(): ReleaseRegressionIssue[] {
  const now = isoNow();
  return [
    {
      id: "rri-1",
      releaseArchiveId: "ra-2",
      title: "채팅 알림 미수신 회귀",
      description: "1.3.0 배포 후 일부 기기에서 채팅 알림 미수신",
      severity: "high",
      status: "investigating" as RegressionIssueStatus,
      detectedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
      fixedAt: null,
      verifiedAt: null,
      ownerAdminId: "admin1",
      ownerAdminNickname: "관리자",
      linkedQaIssueId: null,
      linkedBacklogItemId: null,
      linkedHotfixReleaseId: null,
      regressionCategory: "chat" as RegressionCategory,
      note: "",
    },
    {
      id: "rri-2",
      releaseArchiveId: "ra-1",
      title: "피드 로딩 지연",
      description: "1.2.0 배포 직후 피드 첫 로딩 2초 이상",
      severity: "medium",
      status: "verified",
      detectedAt: new Date(Date.now() - 12 * 86400000).toISOString(),
      fixedAt: new Date(Date.now() - 10 * 86400000).toISOString(),
      verifiedAt: new Date(Date.now() - 9 * 86400000).toISOString(),
      ownerAdminId: null,
      ownerAdminNickname: null,
      linkedQaIssueId: "qai-2",
      linkedBacklogItemId: null,
      linkedHotfixReleaseId: null,
      regressionCategory: "feed",
      note: "",
    },
    {
      id: "rri-3",
      releaseArchiveId: "ra-3",
      title: "로그인 실패 회귀 (반복 패턴)",
      description: "1.1.0에서 인증 플로우 회귀 다수 보고",
      severity: "critical",
      status: "archived",
      detectedAt: new Date(Date.now() - 46 * 86400000).toISOString(),
      fixedAt: null,
      verifiedAt: null,
      ownerAdminId: null,
      ownerAdminNickname: null,
      linkedQaIssueId: null,
      linkedBacklogItemId: null,
      linkedHotfixReleaseId: "ra-1",
      regressionCategory: "auth",
      note: "롤백으로 해결",
    },
  ];
}

function defaultLearningNotes(): ReleaseLearningNote[] {
  const now = isoNow();
  return [
    {
      id: "rln-1",
      releaseArchiveId: "ra-1",
      whatWentWell: "신고 알림 기능 스테이징 검증 완료, 단계적 롤아웃으로 위험 완화",
      whatBroke: "배포 직후 피드 첫 로딩 지연 보고됨",
      regressionSummary: "피드 로딩 1건 감지, 원인 파악 후 패치",
      mitigationSummary: "캐시 워밍 조정으로 24h 내 완화",
      nextReleaseChecklist: "피드 성능 스모크 추가, 로딩 임계치 모니터링",
      createdAt: new Date(Date.now() - 10 * 86400000).toISOString(),
      createdByAdminId: "admin1",
      createdByAdminNickname: "관리자",
    },
    {
      id: "rln-2",
      releaseArchiveId: "ra-2",
      whatWentWell: "피드 깜빡임 수정 검증 완료",
      whatBroke: "채팅 알림 일부 기기 미수신 이슈 감지",
      regressionSummary: "FCM/권한 관련 추정, 조사 중",
      mitigationSummary: "사용자 안내 및 재설치 권장",
      nextReleaseChecklist: "채팅 알림 회귀 테스트 강화, 기기 매트릭스 확대",
      createdAt: now,
      createdByAdminId: "admin1",
      createdByAdminNickname: "관리자",
    },
  ];
}

const ARCHIVES: ReleaseArchive[] = defaultArchives();
const ARCHIVE_ITEMS: ReleaseArchiveItem[] = defaultArchiveItems();
const REGRESSION_ISSUES: ReleaseRegressionIssue[] = defaultRegressionIssues();
const LEARNING_NOTES: ReleaseLearningNote[] = defaultLearningNotes();

export type ReleaseArchiveBundleV1 = {
  version: 1;
  archives: ReleaseArchive[];
  archiveItems: ReleaseArchiveItem[];
  regressionIssues: ReleaseRegressionIssue[];
  learningNotes: ReleaseLearningNote[];
};

function replaceArray<T>(target: T[], next: T[]) {
  target.length = 0;
  target.push(...next);
}

export function createDefaultReleaseArchiveBundle(): ReleaseArchiveBundleV1 {
  return {
    version: 1,
    archives: defaultArchives().map((a) => ({ ...a })),
    archiveItems: defaultArchiveItems().map((i) => ({ ...i })),
    regressionIssues: defaultRegressionIssues().map((i) => ({ ...i })),
    learningNotes: defaultLearningNotes().map((n) => ({ ...n })),
  };
}

export function importReleaseArchiveBundle(bundle: ReleaseArchiveBundleV1): void {
  if (bundle.version !== 1) return;
  replaceArray(ARCHIVES, (bundle.archives ?? []).map((a) => ({ ...a })));
  replaceArray(ARCHIVE_ITEMS, (bundle.archiveItems ?? []).map((i) => ({ ...i })));
  replaceArray(
    REGRESSION_ISSUES,
    (bundle.regressionIssues ?? []).map((i) => ({ ...i }))
  );
  replaceArray(LEARNING_NOTES, (bundle.learningNotes ?? []).map((n) => ({ ...n })));
  if (!ARCHIVES.length) replaceArray(ARCHIVES, defaultArchives());
  if (!ARCHIVE_ITEMS.length) replaceArray(ARCHIVE_ITEMS, defaultArchiveItems());
  if (!REGRESSION_ISSUES.length)
    replaceArray(REGRESSION_ISSUES, defaultRegressionIssues());
  if (!LEARNING_NOTES.length) replaceArray(LEARNING_NOTES, defaultLearningNotes());
}

export function exportReleaseArchiveBundle(): ReleaseArchiveBundleV1 {
  return {
    version: 1,
    archives: ARCHIVES.map((a) => ({ ...a })),
    archiveItems: ARCHIVE_ITEMS.map((i) => ({ ...i })),
    regressionIssues: REGRESSION_ISSUES.map((i) => ({ ...i })),
    learningNotes: LEARNING_NOTES.map((n) => ({ ...n })),
  };
}

/* ─── archives ──────────────────────────────────────────────── */

export function getReleaseArchives(filters?: {
  releaseStatus?: ReleaseArchiveStatus;
  releaseVersion?: string;
}): ReleaseArchive[] {
  let list = [...ARCHIVES].sort(
    (a, b) => new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime()
  );
  if (filters?.releaseStatus)
    list = list.filter((a) => a.releaseStatus === filters.releaseStatus);
  if (filters?.releaseVersion)
    list = list.filter((a) => a.releaseVersion === filters.releaseVersion);
  return list;
}

export function getReleaseArchiveById(id: string): ReleaseArchive | undefined {
  return ARCHIVES.find((a) => a.id === id);
}

/* ─── archive items ─────────────────────────────────────────── */

export function getReleaseArchiveItems(
  releaseArchiveId: string
): ReleaseArchiveItem[] {
  return ARCHIVE_ITEMS.filter((i) => i.releaseArchiveId === releaseArchiveId).sort(
    (a, b) => a.sortOrder - b.sortOrder
  );
}

export function getAllReleaseArchiveItems(filters?: {
  releaseArchiveId?: string;
  changeType?: ReleaseArchiveChangeType;
}): ReleaseArchiveItem[] {
  let list = [...ARCHIVE_ITEMS].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  if (filters?.releaseArchiveId)
    list = list.filter((i) => i.releaseArchiveId === filters.releaseArchiveId);
  if (filters?.changeType)
    list = list.filter((i) => i.changeType === filters.changeType);
  return list;
}

/* ─── regression issues ─────────────────────────────────────── */

export function getReleaseRegressionIssues(filters?: {
  releaseArchiveId?: string;
  status?: RegressionIssueStatus;
  severity?: ReleaseRegressionIssue["severity"];
  regressionCategory?: RegressionCategory;
}): ReleaseRegressionIssue[] {
  let list = [...REGRESSION_ISSUES].sort(
    (a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime()
  );
  if (filters?.releaseArchiveId)
    list = list.filter((i) => i.releaseArchiveId === filters.releaseArchiveId);
  if (filters?.status) list = list.filter((i) => i.status === filters.status);
  if (filters?.severity)
    list = list.filter((i) => i.severity === filters.severity);
  if (filters?.regressionCategory)
    list = list.filter((i) => i.regressionCategory === filters.regressionCategory);
  return list;
}

export function getRegressionIssuesByRelease(
  releaseArchiveId: string
): ReleaseRegressionIssue[] {
  return getReleaseRegressionIssues({ releaseArchiveId });
}

/* ─── learning notes ────────────────────────────────────────── */

export function getReleaseLearningNotes(filters?: {
  releaseArchiveId?: string;
}): ReleaseLearningNote[] {
  let list = [...LEARNING_NOTES].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  if (filters?.releaseArchiveId)
    list = list.filter((n) => n.releaseArchiveId === filters.releaseArchiveId);
  return list;
}

export function getReleaseLearningNoteByRelease(
  releaseArchiveId: string
): ReleaseLearningNote | undefined {
  return getReleaseLearningNotes({ releaseArchiveId })[0];
}
