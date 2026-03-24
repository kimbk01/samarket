/**
 * 52단계: 배포 후 검증 mock
 */

import type {
  PostReleaseCheck,
  PostReleaseCheckPhase,
  PostReleaseCheckStatus,
} from "@/lib/types/dev-sprints";

const now = new Date().toISOString();

const CHECKS: PostReleaseCheck[] = [
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

export function getPostReleaseChecks(filters?: {
  releaseVersion?: string;
  phase?: PostReleaseCheckPhase;
  status?: PostReleaseCheckStatus;
}): PostReleaseCheck[] {
  let list = [...CHECKS].sort(
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
