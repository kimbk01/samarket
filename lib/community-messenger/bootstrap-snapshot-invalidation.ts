/**
 * Shared DB-backed invalidation watermark for CM bootstrap snapshots.
 *
 * Preferred path (ops migration applied): 
 *   invalidate_cm_bootstrap_snapshot_watermark + upsert_cm_bootstrap_snapshot_if_watermark_fence
 *   (advisory-locked, DB clock_timestamp — safe across Vercel instances).
 *
 * Fallback (RPC not yet applied): single PostgREST watermark upsert + multi-step fence.
 * Process-local unacked supplements fallback on the failing instance only.
 *
 * Freshness: payload.ok && age<=TTL && row.updated_at >= watermark.updated_at
 * Snapshot writes use DB clock (RPC) or fence ISO (fallback) — never client now+1ms.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { FBT1_BOOTSTRAP_SNAPSHOT_TABLE } from "@/lib/community-messenger/full-bootstrap-snapshot-counter";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

/** Reserved scope — not a real bootstrap tier. Never used as a read counter key. */
export const BOOTSTRAP_SNAPSHOT_INVALIDATION_SCOPE = "__invalidate__";
export const BOOTSTRAP_SNAPSHOT_INVALIDATION_LIMIT = 0;
export const BOOTSTRAP_SNAPSHOT_INVALIDATION_CURSOR = "";

export const INVALIDATE_BOOTSTRAP_SNAPSHOT_WATERMARK_RPC =
  "invalidate_cm_bootstrap_snapshot_watermark";
export const UPSERT_BOOTSTRAP_SNAPSHOT_IF_WATERMARK_FENCE_RPC =
  "upsert_cm_bootstrap_snapshot_if_watermark_fence";

const INVALIDATED_PAYLOAD = { ok: false, error: "invalidated" } as const;

/** Concrete-row marker when watermark write failed — blocks serving/saving until a durable watermark exists. */
export const BOOTSTRAP_SNAPSHOT_INVALIDATE_WRITE_FAILED = "invalidate_write_failed";
const INVALIDATE_WRITE_FAILED_PAYLOAD = {
  ok: false,
  error: BOOTSTRAP_SNAPSHOT_INVALIDATE_WRITE_FAILED,
} as const;

const pendingBump = new Set<string>();
let bumpFlushScheduled = false;
const bumpInflight = new Map<string, Promise<void>>();

/** Invalidate intent not yet acked by a successful DB watermark write on this instance. */
const unackedInvalidation = new Set<string>();

function invalidationKeys(userId: string) {
  return {
    user_id: userId.trim(),
    bootstrap_scope: BOOTSTRAP_SNAPSHOT_INVALIDATION_SCOPE,
    list_limit: BOOTSTRAP_SNAPSHOT_INVALIDATION_LIMIT,
    cursor_key: BOOTSTRAP_SNAPSHOT_INVALIDATION_CURSOR,
  };
}

function isMissingRpcError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const code = String(error.code ?? "");
  const msg = String(error.message ?? "").toLowerCase();
  return (
    code === "PGRST202" ||
    code === "42883" ||
    msg.includes("could not find the function") ||
    msg.includes("does not exist")
  );
}

/** Compare watermark timestamps across PostgREST string format differences. */
export function bootstrapWatermarkEquals(a: string | null, b: string | null): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  const am = new Date(a).getTime();
  const bm = new Date(b).getTime();
  return Number.isFinite(am) && Number.isFinite(bm) && am === bm;
}

async function upsertWatermarkFallback(
  sb: SupabaseClient<any>,
  keys: ReturnType<typeof invalidationKeys>
): Promise<{ ok: boolean }> {
  const { error } = await sb.from(FBT1_BOOTSTRAP_SNAPSHOT_TABLE).upsert(
    {
      ...keys,
      payload_json: INVALIDATED_PAYLOAD,
      // Omit inventing a future client clock: use fence-aligned ISO from this write instant only as fallback.
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,bootstrap_scope,list_limit,cursor_key" }
  );
  return { ok: !error };
}

async function writeInvalidationWatermark(userId: string): Promise<void> {
  const sb = tryCreateSupabaseServiceClient();
  const keys = invalidationKeys(userId);
  if (!keys.user_id) {
    unackedInvalidation.delete(userId);
    return;
  }
  if (!sb) {
    return;
  }

  const sbAny = sb as SupabaseClient<any>;

  const rpcOnce = async (): Promise<"ok" | "missing" | "fail"> => {
    const { data, error } = await sbAny.rpc(INVALIDATE_BOOTSTRAP_SNAPSHOT_WATERMARK_RPC, {
      p_user_id: keys.user_id,
    });
    if (!error && typeof data === "string" && data.length > 0) return "ok";
    if (!error && data != null) return "ok";
    if (isMissingRpcError(error)) return "missing";
    return "fail";
  };

  let rpcResult = await rpcOnce();
  if (rpcResult === "fail") {
    rpcResult = await rpcOnce();
  }
  if (rpcResult === "ok") {
    if (!pendingBump.has(userId)) unackedInvalidation.delete(userId);
    return;
  }

  if (rpcResult === "missing") {
    let ok = (await upsertWatermarkFallback(sbAny, keys)).ok;
    if (!ok) ok = (await upsertWatermarkFallback(sbAny, keys)).ok;
    if (ok) {
      if (!pendingBump.has(userId)) unackedInvalidation.delete(userId);
      return;
    }
  }

  // Watermark durable write failed. One poison UPDATE for cross-instance fail-closed (no retry loop).
  // If poison also fails, shared DB state is unchanged — other instances may still serve the prior
  // counter until DB writes recover. That is a DB outage limit, not treated as invalidate success.
  // This instance keeps unacked (set at bump) so it does not serve the counter as fresh.
  const poisoned = await poisonConcreteSnapshotsAfterInvalidateFailure(sbAny, userId);
  if (process.env.NODE_ENV === "development") {
    console.warn(
      "[bootstrap-snapshot-invalidate] watermark write failed",
      poisoned ? "(poisoned; unacked retained)" : "(poison failed; unacked retained; no durable signal)"
    );
  }
}

/** Mark concrete counters unusable when watermark could not be durably written. One attempt only. */
async function poisonConcreteSnapshotsAfterInvalidateFailure(
  sb: SupabaseClient<any>,
  userId: string
): Promise<boolean> {
  const { error } = await sb
    .from(FBT1_BOOTSTRAP_SNAPSHOT_TABLE)
    .update({ payload_json: INVALIDATE_WRITE_FAILED_PAYLOAD })
    .eq("user_id", userId)
    .neq("bootstrap_scope", BOOTSTRAP_SNAPSHOT_INVALIDATION_SCOPE);
  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[bootstrap-snapshot-invalidate-poison]", error.message);
    }
    return false;
  }
  return true;
}

/**
 * True when watermark is absent but a prior invalidate-write failure poisoned concrete rows.
 * Blocks saving a "fresh" snapshot that would revive pre-event data across instances.
 */
export async function hasUnrecoveredBootstrapInvalidatePoison(
  sbAny: SupabaseClient<any>,
  userId: string
): Promise<boolean> {
  const uid = userId.trim();
  if (!uid) return false;
  const inv = await readBootstrapSnapshotInvalidationAt(sbAny, uid);
  if (inv.status === "error") return true;
  if (inv.updatedAt) return false;
  const { data, error } = await sbAny
    .from(FBT1_BOOTSTRAP_SNAPSHOT_TABLE)
    .select("bootstrap_scope")
    .eq("user_id", uid)
    .neq("bootstrap_scope", BOOTSTRAP_SNAPSHOT_INVALIDATION_SCOPE)
    .filter("payload_json->>error", "eq", BOOTSTRAP_SNAPSHOT_INVALIDATE_WRITE_FAILED)
    .limit(1);
  if (error) return true;
  return Array.isArray(data) && data.length > 0;
}

function scheduleFlushIfPending(): void {
  if (pendingBump.size === 0 || bumpFlushScheduled) return;
  bumpFlushScheduled = true;
  queueMicrotask(flushPendingBumps);
}

function flushPendingBumps(): void {
  bumpFlushScheduled = false;
  const ids = [...pendingBump];
  pendingBump.clear();
  for (const uid of ids) {
    if (bumpInflight.has(uid)) {
      pendingBump.add(uid);
      continue;
    }
    const flight = writeInvalidationWatermark(uid).finally(() => {
      if (bumpInflight.get(uid) === flight) bumpInflight.delete(uid);
      if (pendingBump.has(uid)) scheduleFlushIfPending();
    });
    bumpInflight.set(uid, flight);
    void flight.catch(() => {});
  }
}

/**
 * Mark bootstrap snapshot counters for this user obsolete (DB watermark).
 * Coalesces sync double-calls into one write. Does not schedule RPC refresh.
 */
export function bumpBootstrapSnapshotInvalidation(userId?: string): void {
  const uid = userId?.trim();
  if (!uid) return;
  unackedInvalidation.add(uid);
  pendingBump.add(uid);
  scheduleFlushIfPending();
}

export function hasUnackedBootstrapSnapshotInvalidation(userId?: string): boolean {
  const uid = userId?.trim();
  if (!uid) return false;
  return unackedInvalidation.has(uid);
}

export async function flushBootstrapSnapshotInvalidationForTests(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    flushPendingBumps();
    const inflight = [...bumpInflight.values()];
    if (inflight.length === 0 && pendingBump.size === 0) return;
    await Promise.all(inflight);
  }
}

export function clearUnackedBootstrapSnapshotInvalidationForTests(): void {
  unackedInvalidation.clear();
}

export type BootstrapSnapshotInvalidationRead =
  | { status: "ok"; updatedAt: string | null }
  | { status: "error" };

export async function readBootstrapSnapshotInvalidationAt(
  sbAny: SupabaseClient<any>,
  userId: string
): Promise<BootstrapSnapshotInvalidationRead> {
  const keys = invalidationKeys(userId);
  if (!keys.user_id) return { status: "ok", updatedAt: null };
  const { data, error } = await sbAny
    .from(FBT1_BOOTSTRAP_SNAPSHOT_TABLE)
    .select("updated_at")
    .eq("user_id", keys.user_id)
    .eq("bootstrap_scope", keys.bootstrap_scope)
    .eq("list_limit", keys.list_limit)
    .eq("cursor_key", keys.cursor_key)
    .maybeSingle();
  if (error) return { status: "error" };
  if (!data || typeof (data as { updated_at?: unknown }).updated_at !== "string") {
    return { status: "ok", updatedAt: null };
  }
  return { status: "ok", updatedAt: (data as { updated_at: string }).updated_at };
}

/**
 * Row usable when newer than or equal to watermark (DB clock on RPC path writes
 * snapshot after watermark under the same lock, so equal is only for fallback fence-copy).
 */
export function isBootstrapSnapshotCounterFresh(input: {
  rowUpdatedAt: string;
  invalidationAt: string | null;
  invalidationReadOk: boolean;
  ageMs: number;
  ttlMs: number;
  payloadOk: boolean;
  unackedLocal?: boolean;
}): boolean {
  if (input.unackedLocal) return false;
  if (!input.invalidationReadOk) return false;
  if (!input.payloadOk) return false;
  if (input.ageMs > input.ttlMs) return false;
  if (!input.invalidationAt) return true;
  const rowMs = new Date(input.rowUpdatedAt).getTime();
  const invMs = new Date(input.invalidationAt).getTime();
  if (!Number.isFinite(rowMs) || !Number.isFinite(invMs)) return false;
  return rowMs >= invMs;
}

/**
 * Fallback-only: copy fence ISO so we never invent client now+1ms ahead of DB.
 * When fence is null, use caller-provided now (first write before any invalidate).
 */
export function snapshotUpdatedAtForFence(fence: string | null | undefined, nowMs = Date.now()): string {
  if (typeof fence === "string" && fence.length > 0) return fence;
  return new Date(nowMs).toISOString();
}

export type FencedSnapshotUpsertResult = "written" | "skipped_stale_race" | "write_error";

/**
 * Prefer advisory-locked RPC; fallback to pre/post fence checks + poison.
 * Does not return success if watermark moved before the write is confirmed.
 */
export async function upsertBootstrapSnapshotWithWatermarkFence(
  sbAny: SupabaseClient<any>,
  input: {
    userId: string;
    bootstrapScope: string;
    listLimit: number;
    cursorKey: string;
    payload: Record<string, unknown>;
    invalidationFence: string | null;
    table?: string;
  }
): Promise<FencedSnapshotUpsertResult> {
  const table = input.table ?? FBT1_BOOTSTRAP_SNAPSHOT_TABLE;
  const fence = input.invalidationFence;

  // Cross-instance fail-closed: no durable watermark + unrecovered poison → refuse save (→ 503, not stale).
  if (fence == null && (await hasUnrecoveredBootstrapInvalidatePoison(sbAny, input.userId))) {
    return "write_error";
  }

  const { data, error } = await sbAny.rpc(UPSERT_BOOTSTRAP_SNAPSHOT_IF_WATERMARK_FENCE_RPC, {
    p_user_id: input.userId,
    p_bootstrap_scope: input.bootstrapScope,
    p_list_limit: input.listLimit,
    p_cursor_key: input.cursorKey,
    p_payload: input.payload,
    p_fence: fence,
  });

  if (!error) {
    if (data === "written") return "written";
    if (data === "skipped_stale_race") return "skipped_stale_race";
    if (data === "write_error") return "write_error";
  } else if (!isMissingRpcError(error)) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[bootstrap-snapshot-fenced-upsert]", error.message);
    }
    return "write_error";
  }

  // Fallback path (RPC not applied yet).
  const invNow = await readBootstrapSnapshotInvalidationAt(sbAny, input.userId);
  if (invNow.status === "error") return "write_error";
  if (!bootstrapWatermarkEquals(invNow.updatedAt, fence)) return "skipped_stale_race";

  const updatedAt = snapshotUpdatedAtForFence(fence);
  const { error: upErr } = await sbAny.from(table).upsert(
    {
      user_id: input.userId,
      bootstrap_scope: input.bootstrapScope,
      list_limit: input.listLimit,
      cursor_key: input.cursorKey,
      payload_json: input.payload,
      updated_at: updatedAt,
    },
    { onConflict: "user_id,bootstrap_scope,list_limit,cursor_key" }
  );
  if (upErr) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[bootstrap-snapshot-upsert-fallback]", upErr.message);
    }
    return "write_error";
  }

  const after = await readBootstrapSnapshotInvalidationAt(sbAny, input.userId);
  if (after.status === "error") return "write_error";
  if (!bootstrapWatermarkEquals(after.updatedAt, fence)) {
    const { error: poisonErr } = await sbAny.from(table).upsert(
      {
        user_id: input.userId,
        bootstrap_scope: input.bootstrapScope,
        list_limit: input.listLimit,
        cursor_key: input.cursorKey,
        payload_json: { ok: false, error: "stale_race" },
        updated_at: updatedAt,
      },
      { onConflict: "user_id,bootstrap_scope,list_limit,cursor_key" }
    );
    if (poisonErr) bumpBootstrapSnapshotInvalidation(input.userId);
    return "skipped_stale_race";
  }
  return "written";
}

/** Fail-closed check immediately before returning a freshly written snapshot to the caller. */
export async function bootstrapSnapshotFenceStillHolds(
  sbAny: SupabaseClient<any>,
  userId: string,
  fence: string | null
): Promise<boolean> {
  const inv = await readBootstrapSnapshotInvalidationAt(sbAny, userId);
  if (inv.status === "error") return false;
  return bootstrapWatermarkEquals(inv.updatedAt, fence);
}
