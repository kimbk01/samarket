/**
 * Logout Native Badge durable clear transaction.
 *
 * Survives window.location.replace / process restart via device-persistent localStorage
 * (@capacitor/preferences not in tree — WebView localStorage is the durable layer).
 *
 * Contract:
 * - begin writes status=pending before navigate
 * - timeout/reject keeps pending (never pretends success)
 * - boot recovery runs before lifecycle hold
 * - pending blocks Native writers with count > 0
 * - completion fenced by transactionId + revision
 */

"use client";

import { getDomainBadgeSurfaceAuthEpoch } from "@/lib/messenger/contracts/domain-badge-surface-store";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";
import { logBadgeFdProbe } from "@/lib/notifications/badge-fd-probe-log";
import { clearNativeBadgeCount } from "@/lib/push/native/sync-native-badge-count";

/** Device-persistent — must stay in DIBAY_DEVICE_PERSISTENT_STORAGE_KEYS. */
export const LOGOUT_BADGE_CLEAR_TX_STORAGE_KEY = "dibay:logout_badge_clear_tx";

export type LogoutBadgeClearTxStatus =
  | "pending"
  | "completed"
  | "web_no_native_badge"
  | "storage_failed";

export type LogoutBadgeClearTransaction = {
  transactionId: string;
  authEpoch: number;
  previousViewerId: string | null;
  targetCount: 0;
  status: LogoutBadgeClearTxStatus;
  createdAt: number;
  attempt: number;
  lastError: string | null;
  revision: number;
  reason: string;
  completedAt: number | null;
};

export type BeginLogoutBadgeClearResult =
  | { ok: true; tx: LogoutBadgeClearTransaction }
  | { ok: false; reason: "storage_failed"; error: string };

function newTransactionId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* ignore */
  }
  return `lbc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function readRaw(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(LOGOUT_BADGE_CLEAR_TX_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeRaw(value: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const storage = window.localStorage;
    if (!storage || typeof storage.setItem !== "function") return false;
    storage.setItem(LOGOUT_BADGE_CLEAR_TX_STORAGE_KEY, value);
    const roundtrip = storage.getItem(LOGOUT_BADGE_CLEAR_TX_STORAGE_KEY);
    return roundtrip === value;
  } catch {
    return false;
  }
}

function removeRaw(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LOGOUT_BADGE_CLEAR_TX_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function parseTx(raw: string | null): LogoutBadgeClearTransaction | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<LogoutBadgeClearTransaction>;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.transactionId !== "string" || !parsed.transactionId) return null;
    if (parsed.targetCount !== 0) return null;
    if (
      parsed.status !== "pending" &&
      parsed.status !== "completed" &&
      parsed.status !== "web_no_native_badge" &&
      parsed.status !== "storage_failed"
    ) {
      return null;
    }
    return {
      transactionId: parsed.transactionId,
      authEpoch: Math.max(0, Math.floor(Number(parsed.authEpoch) || 0)),
      previousViewerId:
        parsed.previousViewerId == null ? null : String(parsed.previousViewerId),
      targetCount: 0,
      status: parsed.status,
      createdAt: Math.max(0, Math.floor(Number(parsed.createdAt) || 0)),
      attempt: Math.max(0, Math.floor(Number(parsed.attempt) || 0)),
      lastError: parsed.lastError == null ? null : String(parsed.lastError),
      revision: Math.max(0, Math.floor(Number(parsed.revision) || 0)),
      reason: String(parsed.reason ?? "unspecified"),
      completedAt:
        parsed.completedAt == null
          ? null
          : Math.max(0, Math.floor(Number(parsed.completedAt) || 0)),
    };
  } catch {
    return null;
  }
}

function persistTx(tx: LogoutBadgeClearTransaction): boolean {
  return writeRaw(JSON.stringify(tx));
}

export function readLogoutBadgeClearTransaction(): LogoutBadgeClearTransaction | null {
  return parseTx(readRaw());
}

export function hasPendingLogoutBadgeClearTransaction(): boolean {
  const tx = readLogoutBadgeClearTransaction();
  return tx?.status === "pending";
}

export function getPendingLogoutBadgeClearTransaction(): LogoutBadgeClearTransaction | null {
  const tx = readLogoutBadgeClearTransaction();
  return tx?.status === "pending" ? tx : null;
}

/** Count of durable pending intents (0 or 1 — single-slot storage). */
export function countPendingLogoutBadgeClearTransactions(): number {
  return hasPendingLogoutBadgeClearTransaction() ? 1 : 0;
}

function logTx(step: string, payload: Record<string, unknown>): void {
  logBadgeFdProbe(`logout_badge_clear_tx.${step}`, payload);
  console.log("[dibay-delivery-trace]", {
    step: `logout_badge_clear_tx.${step}`,
    ...payload,
    t: Date.now(),
  });
}

/**
 * Begin durable pending intent. Replaces any prior pending/completed slot (newer revision wins).
 * Does NOT treat storage failure as success.
 */
export function beginLogoutBadgeClearTransaction(input: {
  previousViewerId: string | null;
  reason: string;
  authEpoch?: number;
}): BeginLogoutBadgeClearResult {
  const prev = readLogoutBadgeClearTransaction();
  const authEpoch =
    input.authEpoch != null
      ? Math.max(0, Math.floor(input.authEpoch))
      : getDomainBadgeSurfaceAuthEpoch();
  const tx: LogoutBadgeClearTransaction = {
    transactionId: newTransactionId(),
    authEpoch,
    previousViewerId: input.previousViewerId,
    targetCount: 0,
    status: "pending",
    createdAt: Date.now(),
    attempt: 0,
    lastError: null,
    revision: (prev?.revision ?? 0) + 1,
    reason: String(input.reason ?? "logout").trim() || "logout",
    completedAt: null,
  };
  if (!persistTx(tx)) {
    logTx("begin_storage_failed", {
      transactionId: tx.transactionId,
      authEpoch: tx.authEpoch,
      reason: tx.reason,
    });
    return { ok: false, reason: "storage_failed", error: "persist_failed" };
  }
  logTx("begin", {
    transactionId: tx.transactionId,
    authEpoch: tx.authEpoch,
    previousViewerId: tx.previousViewerId,
    revision: tx.revision,
    reason: tx.reason,
  });
  return { ok: true, tx };
}

function patchPending(
  transactionId: string,
  patch: Partial<LogoutBadgeClearTransaction>
): LogoutBadgeClearTransaction | null {
  const current = readLogoutBadgeClearTransaction();
  if (!current || current.transactionId !== transactionId) return null;
  if (current.status !== "pending") return null;
  const next: LogoutBadgeClearTransaction = { ...current, ...patch, transactionId };
  if (!persistTx(next)) return null;
  return next;
}

export type ExecuteLogoutBadgeClearResult = {
  transactionId: string;
  outcome:
    | "completed"
    | "web_no_native_badge"
    | "pending_retry"
    | "stale_or_missing"
    | "already_done"
    | "superseded";
  badgeGet: number | null;
  error: string | null;
};

async function readNativeBadgeGetCount(): Promise<number | null> {
  try {
    const { Badge } = await import("@capawesome/capacitor-badge");
    const result = await Badge.get();
    const count = Math.max(0, Math.floor(Number(result?.count) || 0));
    return count;
  } catch {
    return null;
  }
}

/**
 * Execute clear for a specific transactionId (fencing).
 * Success requires native clear apply + Badge.get===0 when get is available.
 */
export async function executeLogoutBadgeClearTransaction(
  transactionId: string
): Promise<ExecuteLogoutBadgeClearResult> {
  const current = readLogoutBadgeClearTransaction();
  if (!current || current.transactionId !== transactionId) {
    return {
      transactionId,
      outcome: "stale_or_missing",
      badgeGet: null,
      error: "stale_or_missing",
    };
  }
  if (current.status === "completed" || current.status === "web_no_native_badge") {
    return {
      transactionId,
      outcome: "already_done",
      badgeGet: 0,
      error: null,
    };
  }
  if (current.status !== "pending") {
    return {
      transactionId,
      outcome: "stale_or_missing",
      badgeGet: null,
      error: `status_${current.status}`,
    };
  }

  const attempt = current.attempt + 1;
  patchPending(transactionId, { attempt, lastError: null });

  if (!isCapacitorNativePlatform()) {
    const completedAt = Date.now();
    const still = readLogoutBadgeClearTransaction();
    if (!still || still.transactionId !== transactionId) {
      return {
        transactionId,
        outcome: "superseded",
        badgeGet: null,
        error: "superseded",
      };
    }
    const done: LogoutBadgeClearTransaction = {
      ...still,
      status: "web_no_native_badge",
      attempt,
      lastError: null,
      completedAt,
    };
    persistTx(done);
    // Tombstone briefly then remove pending slot — web has no OS badge.
    removeRaw();
    logTx("complete_web_no_native", { transactionId, attempt });
    return {
      transactionId,
      outcome: "web_no_native_badge",
      badgeGet: null,
      error: null,
    };
  }

  const clearResult = await clearNativeBadgeCount({
    reason: `logout_badge_clear_tx:${transactionId}`,
  });

  const mid = readLogoutBadgeClearTransaction();
  if (!mid || mid.transactionId !== transactionId) {
    return {
      transactionId,
      outcome: "superseded",
      badgeGet: null,
      error: "superseded_after_clear",
    };
  }
  if (mid.status !== "pending") {
    return {
      transactionId,
      outcome: "already_done",
      badgeGet: 0,
      error: null,
    };
  }

  if (clearResult.attempted && !clearResult.applied) {
    const err = clearResult.error ?? "clear_not_applied";
    patchPending(transactionId, { attempt, lastError: err });
    logTx("execute_pending_retry", { transactionId, attempt, error: err });
    return {
      transactionId,
      outcome: "pending_retry",
      badgeGet: null,
      error: err,
    };
  }

  const badgeGet = await readNativeBadgeGetCount();
  const afterGet = readLogoutBadgeClearTransaction();
  if (!afterGet || afterGet.transactionId !== transactionId) {
    return {
      transactionId,
      outcome: "superseded",
      badgeGet,
      error: "superseded_after_get",
    };
  }

  if (badgeGet != null && badgeGet !== 0) {
    const err = `badge_get_nonzero:${badgeGet}`;
    patchPending(transactionId, { attempt, lastError: err });
    logTx("execute_pending_retry", { transactionId, attempt, error: err, badgeGet });
    return {
      transactionId,
      outcome: "pending_retry",
      badgeGet,
      error: err,
    };
  }

  // badgeGet null → get unsupported; accept clear/apply bridge completion as strongest available ack.
  const completedAt = Date.now();
  const done: LogoutBadgeClearTransaction = {
    ...afterGet,
    status: "completed",
    attempt,
    lastError: null,
    completedAt,
  };
  if (!persistTx(done)) {
    patchPending(transactionId, {
      attempt,
      lastError: "complete_persist_failed",
    });
    return {
      transactionId,
      outcome: "pending_retry",
      badgeGet,
      error: "complete_persist_failed",
    };
  }
  removeRaw();
  logTx("complete", {
    transactionId,
    attempt,
    badgeGet,
    native_clear_completed_at: completedAt,
    authEpoch: done.authEpoch,
    revision: done.revision,
  });
  return {
    transactionId,
    outcome: "completed",
    badgeGet: badgeGet ?? 0,
    error: null,
  };
}

export function markLogoutBadgeClearTimeout(
  transactionId: string,
  detail?: string
): void {
  const err = detail ?? "timeout";
  const patched = patchPending(transactionId, { lastError: err });
  logTx("timeout_keep_pending", {
    transactionId,
    kept: Boolean(patched),
    lastError: err,
  });
}

export function markLogoutBadgeClearFailure(
  transactionId: string,
  error: string
): void {
  const patched = patchPending(transactionId, { lastError: error });
  logTx("failure_keep_pending", {
    transactionId,
    kept: Boolean(patched),
    lastError: error,
  });
}

/**
 * Boot / mount recovery — priority over loading/recovering hold.
 * No-op when no pending intent (no global guest clear).
 */
export async function recoverPendingLogoutBadgeClearTransaction(): Promise<ExecuteLogoutBadgeClearResult | null> {
  const pending = getPendingLogoutBadgeClearTransaction();
  if (!pending) return null;
  logTx("recover_start", {
    transactionId: pending.transactionId,
    attempt: pending.attempt,
    lastError: pending.lastError,
    authEpoch: pending.authEpoch,
  });
  return executeLogoutBadgeClearTransaction(pending.transactionId);
}

/** Test helper */
export function __resetLogoutBadgeClearTransactionForTests(): void {
  removeRaw();
}

/** Test helper — inject durable state (process-restart simulation). */
export function __writeLogoutBadgeClearTransactionForTests(
  tx: LogoutBadgeClearTransaction
): boolean {
  return persistTx(tx);
}
