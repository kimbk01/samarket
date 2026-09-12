/**
 * Date materialization for board import — pick ONCE in [minDays, maxDays] ago.
 * Source date is audit-only; display date is immutable after publish.
 */

import { randomInt } from "node:crypto";

export type BoardImportDatePolicy = {
  minDays: number;
  maxDays: number;
};

export function pickDisplayDateOnce(
  policy: BoardImportDatePolicy,
  nowMs: number = Date.now()
): string {
  const minDays = Math.max(0, Math.floor(policy.minDays));
  const maxDays = Math.max(minDays, Math.floor(policy.maxDays));
  const minMs = nowMs - maxDays * 86_400_000;
  const maxMs = nowMs - minDays * 86_400_000;
  const span = Math.max(0, maxMs - minMs);
  const pick = minMs + (span > 0 ? randomInt(0, span) : 0);
  return new Date(pick).toISOString();
}
