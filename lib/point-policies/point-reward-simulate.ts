/**
 * 24단계: 포인트 지급 시뮬레이션 (mock 계산)
 */

import type { PointRewardSimulation } from "@/lib/types/point-policy";
import { getBoardPointPolicyByKey } from "./mock-board-point-policies";
import { getActiveEventPolicyForBoard } from "./mock-point-event-policies";
import { getPointProbabilityRulesByPolicyId } from "./mock-point-probability-rules";

export function simulatePointReward(
  boardKey: string,
  actionType: "write" | "comment",
  userType: "free" | "premium",
  currentPointBalance: number
): PointRewardSimulation {
  const policy = getBoardPointPolicyByKey(boardKey);
  const event = getActiveEventPolicyForBoard(boardKey);
  const base: PointRewardSimulation = {
    boardKey,
    actionType,
    userType,
    currentPointBalance,
    basePoint: 0,
    rewardPoint: 0,
    appliedMultiplier: 1,
    capped: false,
    cooldownBlocked: false,
  };

  if (!policy || !policy.isActive) return base;

  let rawPoint = 0;
  if (actionType === "write") {
    if (policy.writeRewardType === "fixed") {
      rawPoint = policy.writeFixedPoint;
    } else {
      const rules = getPointProbabilityRulesByPolicyId(policy.id).filter(
        (r) => r.targetType === "write"
      );
      const total = rules.reduce((s, r) => s + r.probabilityPercent, 0);
      const roll = total > 0 ? Math.random() * total : 0;
      let acc = 0;
      for (const r of rules) {
        acc += r.probabilityPercent;
        if (roll < acc) {
          rawPoint =
            r.minPoint +
            Math.floor(Math.random() * (r.maxPoint - r.minPoint + 1));
          break;
        }
      }
    }
  } else {
    if (policy.commentRewardType === "fixed") {
      rawPoint = policy.commentFixedPoint;
    } else {
      rawPoint =
        policy.commentRandomMin +
        Math.floor(
          Math.random() * (policy.commentRandomMax - policy.commentRandomMin + 1)
        );
    }
  }

  let multiplier = 1;
  if (
    policy.eventMultiplierEnabled &&
    event?.isActive &&
    event.startAt <= new Date().toISOString() &&
    event.endAt >= new Date().toISOString()
  ) {
    multiplier =
      actionType === "write" ? event.writeMultiplier : event.commentMultiplier;
  }

  const rewardPoint = Math.round(rawPoint * multiplier);
  const maxCap = userType === "free" ? policy.maxFreeUserPointCap : Infinity;
  const wouldBe = currentPointBalance + rewardPoint;
  const capped = userType === "free" && wouldBe > maxCap;
  const finalPoint = capped ? Math.max(0, maxCap - currentPointBalance) : rewardPoint;

  return {
    ...base,
    basePoint: rawPoint,
    rewardPoint: finalPoint,
    appliedMultiplier: multiplier,
    capped,
    cooldownBlocked: false,
  };
}
