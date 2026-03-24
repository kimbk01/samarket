/**
 * 24단계: 이벤트 포인트 배율 정책 mock
 */

import type { PointEventPolicy } from "@/lib/types/point-policy";
import { addPointPolicyLog } from "./mock-point-policy-logs";

const POLICIES: PointEventPolicy[] = [
  {
    id: "pep-1",
    title: "3월 이벤트",
    isActive: true,
    startAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    endAt: new Date(Date.now() + 86400000 * 28).toISOString(),
    writeMultiplier: 1.5,
    commentMultiplier: 1.2,
    targetBoards: ["general", "qna"],
    note: "이벤트 기간 포인트 배율",
    createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

function nextId(): string {
  const nums = POLICIES.map((p) =>
    parseInt(p.id.replace("pep-", ""), 10)
  ).filter((n) => !Number.isNaN(n));
  const max = nums.length ? Math.max(...nums) : 0;
  return `pep-${max + 1}`;
}

export function getPointEventPolicies(): PointEventPolicy[] {
  return POLICIES.map((p) => ({ ...p }));
}

export function getPointEventPolicyById(id: string): PointEventPolicy | undefined {
  return POLICIES.find((p) => p.id === id);
}

export function getActiveEventPolicyForBoard(
  boardKey: string
): PointEventPolicy | undefined {
  const now = new Date().toISOString();
  return POLICIES.find(
    (p) =>
      p.isActive &&
      p.targetBoards.includes(boardKey) &&
      p.startAt <= now &&
      p.endAt >= now
  );
}

export function savePointEventPolicy(
  input: Omit<PointEventPolicy, "id" | "createdAt" | "updatedAt"> & {
    id?: string;
    createdAt?: string;
    updatedAt?: string;
  }
): PointEventPolicy {
  const now = new Date().toISOString();
  const existing = input.id ? POLICIES.find((p) => p.id === input.id) : null;
  if (existing) {
    Object.assign(existing, { ...input, updatedAt: now });
    addPointPolicyLog("event_policy", existing.id, "update", "이벤트 정책 수정");
    return { ...existing };
  }
  const policy: PointEventPolicy = {
    ...input,
    id: nextId(),
    createdAt: now,
    updatedAt: now,
  };
  POLICIES.push(policy);
  addPointPolicyLog("event_policy", policy.id, "create", "이벤트 정책 생성");
  return { ...policy };
}

export function setPointEventPolicyActive(
  id: string,
  isActive: boolean
): PointEventPolicy | undefined {
  const p = POLICIES.find((x) => x.id === id);
  if (!p) return undefined;
  p.isActive = isActive;
  p.updatedAt = new Date().toISOString();
  addPointPolicyLog(
    "event_policy",
    id,
    isActive ? "activate" : "deactivate",
    isActive ? "활성화" : "비활성화"
  );
  return { ...p };
}
