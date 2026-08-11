/**
 * ONE SOURCE + policy version → ONE amount.
 * Node crypto hash. Product path must not use a PRNG call.
 */
import { createHash } from "node:crypto";

export function deterministicIntInRange(seed: string, min: number, max: number): number {
  const lo = Math.trunc(Number(min) || 0);
  const hi = Math.trunc(Number(max) || 0);
  if (hi <= lo) return lo;
  const digest = createHash("sha256").update(String(seed), "utf8").digest();
  const n = digest.readUInt32BE(0);
  return lo + (n % (hi - lo + 1));
}

export function communityRewardAmountSeed(input: {
  executionKey: string;
  policyId: string;
  policyVersion: number;
  rewardType: "fixed" | "random";
  min: number;
  max: number;
}): string {
  return [
    input.executionKey,
    input.policyId,
    String(input.policyVersion),
    input.rewardType,
    String(input.min),
    String(input.max),
  ].join("|");
}

export function resolveFixedOrRandomBase(input: {
  rewardType: "fixed" | "random";
  fixedPoint: number;
  randomMin: number;
  randomMax: number;
  seed: string;
}): number {
  if (input.rewardType === "fixed") {
    return Math.max(0, Math.trunc(Number(input.fixedPoint) || 0));
  }
  return deterministicIntInRange(input.seed, input.randomMin, input.randomMax);
}

export function applyEventMultiplier(base: number, multiplier: number): number {
  const m = Number(multiplier);
  const safe = Number.isFinite(m) && m > 0 ? m : 1;
  return Math.round(base * safe);
}

export function buildCommunityRewardExecutionKey(input: {
  targetType: "post" | "comment";
  targetId: string;
}): string {
  const id = String(input.targetId ?? "").trim();
  const kind = input.targetType === "comment" ? "community_comment" : "community_post";
  return `${kind}:create:${id}`;
}
