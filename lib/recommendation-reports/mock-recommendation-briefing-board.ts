/**
 * 37단계: 관리자 브리핑 보드 mock
 */

import type { RecommendationBriefingBoard } from "@/lib/types/recommendation-report";

const BOARDS: RecommendationBriefingBoard[] = [];

export function getRecommendationBriefingBoard(
  reportId: string
): RecommendationBriefingBoard | undefined {
  const existing = BOARDS.find((b) => b.reportId === reportId);
  if (existing) return existing;
  const board: RecommendationBriefingBoard = {
    id: `rbb-${reportId}`,
    reportId,
    topHighlights: [
      "홈 추천 섹션 CTR 전일 대비 +2%p",
      "전환율 0.78% 유지",
    ],
    topRisks: [
      "검색 surface 빈피드율 3% 주의",
    ],
    topWinningSections: ["recommended", "local_latest"],
    topDroppedSections: ["sponsored"],
    deploymentSummary: "홈 fv-control-home 운영 중. 최근 배포 1건 성공.",
    rollbackSummary: "최근 롤백 없음.",
    automationSummary: "오늘 자동 Fallback 0건, 킬스위치 0건, 롤백 0건.",
    createdAt: new Date().toISOString(),
  };
  BOARDS.push(board);
  return board;
}

export function setRecommendationBriefingBoard(
  board: RecommendationBriefingBoard
): void {
  const i = BOARDS.findIndex((b) => b.reportId === board.reportId);
  if (i !== -1) BOARDS[i] = board;
  else BOARDS.push(board);
}
