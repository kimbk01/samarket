/**
 * 26단계: 포인트 만료 시뮬레이션 및 실행
 */

import type { PointLedgerEntry } from "@/lib/types/point";
import type { PointExpirePolicy } from "@/lib/types/point-expire";
import { getPointLedgerForAdmin } from "./mock-point-ledger";
import { appendPointLedger, markLedgerEntryExpired } from "./mock-point-ledger";
import { addPointActionLog } from "./mock-point-action-logs";
import { getActivePointExpirePolicy } from "./mock-point-expire-policies";
import { addPointExpireExecution } from "./mock-point-expire-executions";
import { addPointExpireLog } from "./mock-point-expire-logs";
import { isEntryExpirable } from "./point-expire-utils";

export interface ExpireSimulationItem {
  userId: string;
  userNickname: string;
  ledgerEntryId: string;
  amount: number;
  expiresAt: string;
  description: string;
}

export interface ExpireSimulationResult {
  asOfDate: string;
  policyId: string;
  policyName: string;
  items: ExpireSimulationItem[];
  totalByUser: Map<string, { total: number; nickname: string }>;
}

/** 만료 대상 목록 생성 (시뮬레이션) */
export function simulatePointExpire(asOfDate: string): ExpireSimulationResult | null {
  const policy = getActivePointExpirePolicy();
  if (!policy) return null;
  const entries = getPointLedgerForAdmin();
  const runTime = new Date(asOfDate).getTime();
  const items: ExpireSimulationItem[] = [];
  entries.forEach((e) => {
    if (!isEntryExpirable(e, policy)) return;
    if (!e.expiresAt || new Date(e.expiresAt).getTime() > runTime) return;
    items.push({
      userId: e.userId,
      userNickname: e.userNickname,
      ledgerEntryId: e.id,
      amount: e.amount,
      expiresAt: e.expiresAt,
      description: e.description,
    });
  });
  const totalByUser = new Map<string, { total: number; nickname: string }>();
  items.forEach((i) => {
    const cur = totalByUser.get(i.userId);
    if (!cur) totalByUser.set(i.userId, { total: i.amount, nickname: i.userNickname });
    else cur.total += i.amount;
  });
  return {
    asOfDate,
    policyId: policy.id,
    policyName: policy.policyName,
    items,
    totalByUser,
  };
}

/** 실제 만료 실행 (asOfDate 기준 만료 대상 차감) */
export function runPointExpire(
  asOfDate: string,
  actorType: "admin" | "system" = "system"
): { executionIds: string[]; totalExpired: number } {
  const sim = simulatePointExpire(asOfDate);
  if (!sim || sim.items.length === 0) {
    return { executionIds: [], totalExpired: 0 };
  }
  const policy = getActivePointExpirePolicy();
  if (!policy) return { executionIds: [], totalExpired: 0 };

  const executionIds: string[] = [];
  let totalExpired = 0;
  const userGroups = new Map<string, ExpireSimulationItem[]>();
  sim.items.forEach((i) => {
    const list = userGroups.get(i.userId) || [];
    list.push(i);
    userGroups.set(i.userId, list);
  });

  userGroups.forEach((items, userId) => {
    const nickname = items[0]?.userNickname ?? userId;
    const userTotal = items.reduce((s, i) => s + i.amount, 0);
    const execution = addPointExpireExecution({
      executionDate: asOfDate,
      policyId: policy.id,
      targetUserId: userId,
      targetUserNickname: nickname,
      totalCandidatePoint: userTotal,
      expiredPoint: userTotal,
      remainingPoint: 0,
      executionStatus: "success",
      createdAt: new Date().toISOString(),
    });
    const entry = appendPointLedger(
      userId,
      nickname,
      "expire",
      userTotal,
      "admin_manual",
      execution.id,
      `포인트 만료 (${policy.policyName})`,
      actorType
    );
    items.forEach((i) => {
      markLedgerEntryExpired(i.ledgerEntryId, i.amount);
      addPointExpireLog({
        executionId: execution.id,
        ledgerEntryId: i.ledgerEntryId,
        userId,
        userNickname: nickname,
        expiredPoint: i.amount,
        expiresAt: i.expiresAt,
        actionType: "expire",
        actorType,
        createdAt: new Date().toISOString(),
        note: i.description,
      });
    });
    addPointActionLog(
      "expire_points",
      actorType,
      actorType === "admin" ? "admin-1" : "system",
      actorType === "admin" ? "관리자" : "시스템",
      userId,
      nickname,
      entry.id,
      `포인트 만료 -${userTotal}P`
    );
    executionIds.push(execution.id);
    totalExpired += userTotal;
  });

  return { executionIds, totalExpired };
}
