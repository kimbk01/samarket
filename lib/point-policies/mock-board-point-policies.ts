/**
 * 24단계: 게시판 포인트 정책 mock
 */

import type { BoardPointPolicy } from "@/lib/types/point-policy";
import { addPointPolicyLog } from "./mock-point-policy-logs";

const POLICIES: BoardPointPolicy[] = [
  {
    id: "bpp-1",
    boardKey: "general",
    boardName: "자유게시판",
    isActive: true,
    writeRewardType: "fixed",
    writeFixedPoint: 5,
    writeRandomMin: 0,
    writeRandomMax: 0,
    writeCooldownSeconds: 60,
    commentRewardType: "fixed",
    commentFixedPoint: 2,
    commentRandomMin: 0,
    commentRandomMax: 0,
    commentCooldownSeconds: 30,
    likeRewardPoint: 0,
    reportRewardPoint: 0,
    maxFreeUserPointCap: 500,
    eventMultiplierEnabled: true,
    updatedAt: new Date().toISOString(),
  },
  {
    id: "bpp-2",
    boardKey: "qna",
    boardName: "Q&A",
    isActive: true,
    writeRewardType: "random",
    writeFixedPoint: 0,
    writeRandomMin: 3,
    writeRandomMax: 10,
    writeCooldownSeconds: 120,
    commentRewardType: "fixed",
    commentFixedPoint: 1,
    commentRandomMin: 0,
    commentRandomMax: 0,
    commentCooldownSeconds: 20,
    likeRewardPoint: 0,
    reportRewardPoint: 0,
    maxFreeUserPointCap: 300,
    eventMultiplierEnabled: false,
    updatedAt: new Date(Date.now() - 86400000).toISOString(),
  },
];

function nextId(): string {
  const nums = POLICIES.map((p) =>
    parseInt(p.id.replace("bpp-", ""), 10)
  ).filter((n) => !Number.isNaN(n));
  const max = nums.length ? Math.max(...nums) : 0;
  return `bpp-${max + 1}`;
}

export function getBoardPointPolicies(): BoardPointPolicy[] {
  return POLICIES.map((p) => ({ ...p }));
}

export function getBoardPointPolicyById(id: string): BoardPointPolicy | undefined {
  return POLICIES.find((p) => p.id === id);
}

export function getBoardPointPolicyByKey(boardKey: string): BoardPointPolicy | undefined {
  return POLICIES.find((p) => p.boardKey === boardKey);
}

export function saveBoardPointPolicy(
  input: Omit<BoardPointPolicy, "id" | "updatedAt"> & { id?: string }
): BoardPointPolicy {
  const now = new Date().toISOString();
  const existing = input.id ? POLICIES.find((p) => p.id === input.id) : null;
  if (existing) {
    Object.assign(existing, { ...input, updatedAt: now });
    addPointPolicyLog("board_policy", existing.id, "update", "게시판 정책 수정");
    return { ...existing };
  }
  const policy: BoardPointPolicy = {
    ...input,
    id: nextId(),
    updatedAt: now,
  };
  POLICIES.push(policy);
  addPointPolicyLog("board_policy", policy.id, "create", "게시판 정책 생성");
  return { ...policy };
}

export function setBoardPointPolicyActive(id: string, isActive: boolean): BoardPointPolicy | undefined {
  const p = POLICIES.find((x) => x.id === id);
  if (!p) return undefined;
  p.isActive = isActive;
  p.updatedAt = new Date().toISOString();
  addPointPolicyLog(
    "board_policy",
    id,
    isActive ? "activate" : "deactivate",
    isActive ? "활성화" : "비활성화"
  );
  return { ...p };
}
