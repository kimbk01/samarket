/**
 * 릴리즈 아카이브 유틸 — 라벨 + 상태 getter re-export
 * 데이터 영속화: `release-archive-state` + `/api/admin/release-archive`
 */
export {
  getReleaseStatusLabel,
  getChangeTypeLabel,
  getRegressionSeverityLabel,
  getRegressionStatusLabel,
  getRegressionCategoryLabel,
} from "@/lib/release-archive/release-archive-label-i18n";

export {
  getReleaseArchives,
  getReleaseArchiveById,
  getReleaseArchiveItems,
  getAllReleaseArchiveItems,
  getReleaseRegressionIssues,
  getRegressionIssuesByRelease,
  getReleaseLearningNotes,
  getReleaseLearningNoteByRelease,
} from "@/lib/release-archive/release-archive-state";

export { getReleaseArchiveSummary } from "@/lib/release-archive/release-archive-summary";
