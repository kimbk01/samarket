import {
  applyEventMultiplier,
  communityRewardAmountSeed,
  resolveFixedOrRandomBase,
} from "@/lib/community-points/deterministic-award";
import type {
  BoardPointPolicy,
  PointEventPolicy,
  PointProbabilityRule,
  PointRewardSimulation,
} from "@/lib/types/point-policy";

/**
 * Admin preview + legacy callers.
 * Product community writer does not use probabilityRules.
 * Random = write/comment min/max + deterministic seed.
 */
export function computePointRewardSimulation(input: {
  boardKey: string;
  actionType: "write" | "comment";
  userType: "free" | "premium";
  currentPointBalance: number;
  policy: BoardPointPolicy | null | undefined;
  event: PointEventPolicy | null | undefined;
  probabilityRules: PointProbabilityRule[];
  amountSeed?: string;
}): PointRewardSimulation {
  const { boardKey, actionType, userType, currentPointBalance, policy, event } = input;
  void input.probabilityRules;
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

  const rewardType = actionType === "write" ? policy.writeRewardType : policy.commentRewardType;
  const fixedPoint = actionType === "write" ? policy.writeFixedPoint : policy.commentFixedPoint;
  const randomMin = actionType === "write" ? policy.writeRandomMin : policy.commentRandomMin;
  const randomMax = actionType === "write" ? policy.writeRandomMax : policy.commentRandomMax;
  const seed =
    input.amountSeed ??
    communityRewardAmountSeed({
      executionKey: `preview:${boardKey}:${actionType}`,
      policyId: policy.id,
      policyVersion: policy.policyVersion ?? 1,
      rewardType,
      min: randomMin,
      max: randomMax,
    });
  const rawPoint = resolveFixedOrRandomBase({
    rewardType,
    fixedPoint,
    randomMin,
    randomMax,
    seed,
  });

  let multiplier = 1;
  const now = new Date().toISOString();
  if (
    policy.eventMultiplierEnabled &&
    event?.isActive &&
    event.startAt <= now &&
    event.endAt >= now
  ) {
    multiplier = actionType === "write" ? event.writeMultiplier : event.commentMultiplier;
  }

  const rewardPoint = applyEventMultiplier(rawPoint, multiplier);
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
