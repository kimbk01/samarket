/**
 * 53단계: 릴리즈 학습 메모 mock
 */

import type { ReleaseLearningNote } from "@/lib/types/release-archive";

const now = new Date().toISOString();

const NOTES: ReleaseLearningNote[] = [
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

export function getReleaseLearningNotes(filters?: {
  releaseArchiveId?: string;
}): ReleaseLearningNote[] {
  let list = [...NOTES].sort(
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
