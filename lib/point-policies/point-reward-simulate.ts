/**
 * 24단계: 포인트 지급 시뮬레이션 (mock 계산)
 */

import type { PointRewardSimulation } from "@/lib/types/point-policy";
import { computePointRewardSimulation } from "./point-reward-simulate-core";

/** @deprecated 관리자 UI는 /api/admin/point-policies/simulate 사용 */
export function simulatePointReward(
  boardKey: string,
  actionType: "write" | "comment",
  userType: "free" | "premium",
  currentPointBalance: number
): PointRewardSimulation {
  return computePointRewardSimulation({
    boardKey,
    actionType,
    userType,
    currentPointBalance,
    policy: null,
    event: null,
    probabilityRules: [],
  });
}
