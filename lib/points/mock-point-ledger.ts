/**
 * 23단계: 포인트 원장 mock (잔액은 admin-users POINT_BALANCE와 연동)
 */

import type {
  PointLedgerEntry,
  PointLedgerEntryType,
  PointLedgerRelatedType,
  PointLedgerActorType,
} from "@/lib/types/point";
import { addUserPointBalance, getUserPointBalance } from "@/lib/admin-users/mock-admin-users";

const ENTRIES: PointLedgerEntry[] = [];
let seeded = false;
function seedOnce(): void {
  if (seeded) return;
  seeded = true;
  const userId = "me";
  const userNickname = "KASAMA";
  const amount = 5250;
  const balanceAfter = addUserPointBalance(userId, amount);
  ENTRIES.push({
    id: "ple-seed",
    userId,
    userNickname,
    entryType: "charge",
    amount,
    balanceAfter,
    relatedType: "point_charge",
    relatedId: "pcr-1",
    description: "충전 승인: 5,000P (+5% 보너스)",
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    actorType: "admin",
  });
  const earnedAt = new Date(Date.now() - 86400000 * 10).toISOString();
  const expiresAt = new Date(Date.now() + 86400000 * 355).toISOString();
  const rewardAmount = 5;
  const balanceAfterReward = addUserPointBalance(userId, rewardAmount);
  ENTRIES.push({
    id: "ple-seed-expiring",
    userId,
    userNickname,
    entryType: "reward",
    amount: rewardAmount,
    balanceAfter: balanceAfterReward,
    relatedType: "community_reward",
    relatedId: "pre-demo",
    description: "커뮤니티 보상 (만료 예정 샘플)",
    createdAt: earnedAt,
    actorType: "system",
    earnedAt,
    expiresAt,
  });
}

function nextId(): string {
  const nums = ENTRIES.map((e) =>
    parseInt(e.id.replace("ple-", ""), 10)
  ).filter((n) => !Number.isNaN(n));
  const max = nums.length ? Math.max(...nums) : 0;
  return `ple-${max + 1}`;
}

export function appendPointLedger(
  userId: string,
  userNickname: string,
  entryType: PointLedgerEntryType,
  amount: number,
  relatedType: PointLedgerRelatedType,
  relatedId: string,
  description: string,
  actorType: PointLedgerActorType,
  options?: { earnedAt?: string; expiresAt?: string }
): PointLedgerEntry {
  seedOnce();
  const isDebit =
    entryType === "spend" ||
    entryType === "expire" ||
    entryType === "reverse" ||
    entryType === "ad_purchase";
  const delta = isDebit ? -Math.abs(amount) : Math.abs(amount);
  const balanceAfter = addUserPointBalance(userId, delta);
  const entry: PointLedgerEntry = {
    id: nextId(),
    userId,
    userNickname,
    entryType,
    amount: isDebit ? -amount : amount,
    balanceAfter,
    relatedType,
    relatedId,
    description,
    createdAt: new Date().toISOString(),
    actorType,
    ...(options?.earnedAt && { earnedAt: options.earnedAt }),
    ...(options?.expiresAt && { expiresAt: options.expiresAt }),
  };
  ENTRIES.push(entry);
  return { ...entry };
}

/** 26단계: 원장 항목 만료 처리 (내부 참조 갱신) */
export function markLedgerEntryExpired(
  entryId: string,
  expiredAmount: number
): void {
  const e = ENTRIES.find((x) => x.id === entryId);
  if (e) {
    e.isExpired = true;
    e.expiredAmount = expiredAmount;
  }
}

export function getLedgerEntryById(entryId: string): PointLedgerEntry | undefined {
  seedOnce();
  const e = ENTRIES.find((x) => x.id === entryId);
  return e ? { ...e } : undefined;
}

export function getPointLedgerByUserId(
  userId: string
): PointLedgerEntry[] {
  seedOnce();
  return ENTRIES.filter((e) => e.userId === userId)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    .map((e) => ({ ...e }));
}

export function getPointLedgerForAdmin(): PointLedgerEntry[] {
  seedOnce();
  return [...ENTRIES].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export { getUserPointBalance } from "@/lib/admin-users/mock-admin-users";
