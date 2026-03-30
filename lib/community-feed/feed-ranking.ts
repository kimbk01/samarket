/** 피드 ‘추천’ 탭용: 최근 글 풀에서 참여도·시간 감쇠로 재정렬 */

export type RankableFeedRow = {
  like_count?: number;
  comment_count?: number;
  view_count?: number;
  created_at?: string;
};

function recommendedScore(r: RankableFeedRow, nowMs: number): number {
  const likes = Number(r.like_count ?? 0);
  const comments = Number(r.comment_count ?? 0);
  const views = Number(r.view_count ?? 0);
  const parsed = r.created_at ? new Date(r.created_at).getTime() : NaN;
  const created = Number.isNaN(parsed) ? nowMs : parsed;
  const ageDays = Math.max(0, (nowMs - created) / 86_400_000);
  const engagement = likes * 2 + comments * 3 + Math.min(views / 40, 25);
  return engagement / (1 + ageDays / 4);
}

export function rankByRecommended<T extends RankableFeedRow>(rows: T[], limit: number): T[] {
  const now = Date.now();
  return [...rows].sort((a, b) => recommendedScore(b, now) - recommendedScore(a, now)).slice(0, limit);
}
