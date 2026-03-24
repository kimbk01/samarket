/**
 * 32단계: 실험 로그 mock
 */

import type { ExperimentLog, ExperimentLogActionType } from "@/lib/types/recommendation-experiment";

const LOGS: ExperimentLog[] = [
  {
    id: "el-1",
    experimentId: "exp-1",
    actionType: "create",
    actorType: "admin",
    actorId: "admin1",
    actorNickname: "관리자",
    note: "실험 생성",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
  },
  {
    id: "el-2",
    experimentId: "exp-1",
    actionType: "start",
    actorType: "admin",
    actorId: "admin1",
    actorNickname: "관리자",
    note: "실험 시작",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
  },
];

export function getExperimentLogs(experimentId?: string): ExperimentLog[] {
  let list = [...LOGS];
  if (experimentId) list = list.filter((l) => l.experimentId === experimentId);
  return list.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function addExperimentLog(
  experimentId: string,
  actionType: ExperimentLogActionType,
  note: string,
  actorType: "admin" | "system" = "admin",
  actorId = "admin1",
  actorNickname = "관리자"
): ExperimentLog {
  const log: ExperimentLog = {
    id: `el-${Date.now()}`,
    experimentId,
    actionType,
    actorType,
    actorId,
    actorNickname,
    note,
    createdAt: new Date().toISOString(),
  };
  LOGS.unshift(log);
  return log;
}
