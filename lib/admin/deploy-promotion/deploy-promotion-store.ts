/**
 * Process-local promotion ledger for bootstrap.
 * Survives within one serverless instance only — replace with durable store on TEST DB (P1+).
 * NOT a substitute for Production audit DB until Owner provisions TEST/ops table.
 */

import type { DeployPromotionRecord } from "@/lib/admin/deploy-promotion/deploy-promotion-ssot";

const g = globalThis as typeof globalThis & {
  __dibayDeployPromotionLedger?: Map<string, DeployPromotionRecord>;
};

function ledger(): Map<string, DeployPromotionRecord> {
  if (!g.__dibayDeployPromotionLedger) {
    g.__dibayDeployPromotionLedger = new Map();
  }
  return g.__dibayDeployPromotionLedger;
}

export function getDeployPromotionRecord(sha: string): DeployPromotionRecord | null {
  return ledger().get(sha.toLowerCase()) ?? null;
}

export function upsertDeployPromotionRecord(record: DeployPromotionRecord): DeployPromotionRecord {
  const key = record.sha.toLowerCase();
  const next = { ...record, sha: key };
  ledger().set(key, next);
  return next;
}

export function listRecentDeployPromotionRecords(limit = 20): DeployPromotionRecord[] {
  return [...ledger().values()]
    .sort((a, b) => (b.verifiedAt ?? b.promotedAt ?? "").localeCompare(a.verifiedAt ?? a.promotedAt ?? ""))
    .slice(0, limit);
}
