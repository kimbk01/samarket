"use client";

import { useState } from "react";
import type { PointRewardSimulation } from "@/lib/types/point-policy";
import { simulatePointReward } from "@/lib/point-policies/point-reward-simulate";
import { BOARD_OPTIONS, USER_TYPE_LABELS } from "@/lib/point-policies/point-policy-utils";

export function PointRewardSimulator() {
  const [boardKey, setBoardKey] = useState("general");
  const [actionType, setActionType] = useState<"write" | "comment">("write");
  const [userType, setUserType] = useState<"free" | "premium">("free");
  const [currentPointBalance, setCurrentPointBalance] = useState(100);
  const [result, setResult] = useState<PointRewardSimulation | null>(null);

  const handleSimulate = (e: React.FormEvent) => {
    e.preventDefault();
    const sim = simulatePointReward(
      boardKey,
      actionType,
      userType,
      currentPointBalance
    );
    setResult(sim);
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleSimulate} className="space-y-3">
        <div>
          <label className="mb-1 block sam-text-body font-medium text-sam-fg">
            게시판
          </label>
          <select
            value={boardKey}
            onChange={(e) => setBoardKey(e.target.value)}
            className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
          >
            {BOARD_OPTIONS.map((b) => (
              <option key={b.key} value={b.key}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block sam-text-body font-medium text-sam-fg">
            행동
          </label>
          <select
            value={actionType}
            onChange={(e) =>
              setActionType(e.target.value as "write" | "comment")
            }
            className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
          >
            <option value="write">글쓰기</option>
            <option value="comment">댓글</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block sam-text-body font-medium text-sam-fg">
            회원 유형
          </label>
          <select
            value={userType}
            onChange={(e) =>
              setUserType(e.target.value as "free" | "premium")
            }
            className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
          >
            <option value="free">{USER_TYPE_LABELS.free}</option>
            <option value="premium">{USER_TYPE_LABELS.premium}</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block sam-text-body font-medium text-sam-fg">
            현재 포인트 잔액
          </label>
          <input
            type="number"
            min={0}
            value={currentPointBalance}
            onChange={(e) =>
              setCurrentPointBalance(parseInt(e.target.value, 10) || 0)
            }
            className="w-32 rounded border border-sam-border px-3 py-2 sam-text-body"
          />
        </div>
        <button
          type="submit"
          className="rounded border border-signature bg-signature px-4 py-2 sam-text-body font-medium text-white"
        >
          시뮬레이션
        </button>
      </form>

      {result && (
        <div className="rounded-ui-rect border border-sam-border bg-sam-app p-4">
          <h3 className="sam-text-body font-medium text-sam-fg">결과</h3>
          <dl className="mt-2 space-y-1 sam-text-body">
            <div className="flex justify-between">
              <dt className="text-sam-muted">지급 포인트</dt>
              <dd className="font-semibold text-sam-fg">
                +{result.rewardPoint}P
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sam-muted">적용 배율</dt>
              <dd>{result.appliedMultiplier}x</dd>
            </div>
            {result.capped && (
              <div className="text-amber-700">무상 한도로 인해 상한 적용됨</div>
            )}
            {result.cooldownBlocked && (
              <div className="text-amber-700">쿨다운으로 차단됨</div>
            )}
          </dl>
        </div>
      )}
    </div>
  );
}
