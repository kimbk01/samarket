/**
 * 53단계: 릴리즈 아카이브 mock (52 release notes, 33 deployment 연동)
 */

import type { ReleaseArchive, ReleaseArchiveStatus } from "@/lib/types/release-archive";

const now = new Date().toISOString();

const ARCHIVES: ReleaseArchive[] = [
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
