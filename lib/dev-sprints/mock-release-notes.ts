/**
 * 52단계: 릴리즈 노트 mock
 */

import type { ReleaseNote, ReleaseNoteStatus } from "@/lib/types/dev-sprints";

const now = new Date().toISOString();

const NOTES: ReleaseNote[] = [
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

export function getReleaseNotes(filters?: {
  status?: ReleaseNoteStatus;
  releaseVersion?: string;
}): ReleaseNote[] {
  let list = [...NOTES].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  if (filters?.status) list = list.filter((n) => n.status === filters.status);
  if (filters?.releaseVersion)
    list = list.filter((n) => n.releaseVersion === filters.releaseVersion);
  return list;
}

export function getReleaseNoteById(id: string): ReleaseNote | undefined {
  return NOTES.find((n) => n.id === id);
}
