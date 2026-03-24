/**
 * 46단계: 런칭 blocker 로그 mock
 */

import type {
  LaunchBlockerLog,
  LaunchBlockerActionType,
} from "@/lib/types/launch-readiness";

const LOGS: LaunchBlockerLog[] = [
  {
    id: "lbl-1",
    readinessItemId: "lri-6",
    actionType: "create_blocker",
    actorType: "admin",
    actorId: "admin2",
    actorNickname: "운영B",
    note: "결제 PG 샌드박스 이슈 대기 중",
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
  {
    id: "lbl-2",
    readinessItemId: "lri-6",
    actionType: "update_blocker",
    actorType: "admin",
    actorId: "admin2",
    actorNickname: "운영B",
    note: "PG사 응답 대기로 사유 보강",
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  },
];

export function getLaunchBlockerLogs(filters?: {
  readinessItemId?: string;
}): LaunchBlockerLog[] {
  let list = [...LOGS].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  if (filters?.readinessItemId)
    list = list.filter((l) => l.readinessItemId === filters.readinessItemId);
  return list;
}
