import type {
  BoardPointPolicy,
  PointEventPolicy,
  PointProbabilityRule,
  PointRewardSimulation,
} from "@/lib/types/point-policy";

/** 정책 데이터를 주입받아 포인트 지급 시뮬레이션 (DB/mock 공용) */
export function computePointRewardSimulation(input: {
  boardKey: string;
  actionType: "write" | "comment";
  userType: "free" | "premium";
  currentPointBalance: number;
  policy: BoardPointPolicy | null | undefined;
  event: PointEventPolicy | null | undefined;
  probabilityRules: PointProbabilityRule[];
}): PointRewardSimulation {
  const { boardKey, actionType, userType, currentPointBalance, policy, event, probabilityRules } =
    input;
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
      const rules = probabilityRules.filter((r) => r.targetType === "write");
      const total = rules.reduce((s, r) => s + r.probabilityPercent, 0);
      const roll = total > 0 ? Math.random() * total : 0;
      let acc = 0;
      for (const r of rules) {
        acc += r.probabilityPercent;
        if (roll < acc) {
          rawPoint = r.minPoint + Math.floor(Math.random() * (r.maxPoint - r.minPoint + 1));
          break;
        }
      }
    }
  } else if (policy.commentRewardType === "fixed") {
    rawPoint = policy.commentFixedPoint;
  } else {
    rawPoint =
      policy.commentRandomMin +
      Math.floor(Math.random() * (policy.commentRandomMax - policy.commentRandomMin + 1));
  }

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
