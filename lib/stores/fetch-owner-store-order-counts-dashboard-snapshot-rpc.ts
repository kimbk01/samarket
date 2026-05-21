import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type OrderCountsColdBreakdown,
  pickOrderCountsSlowestStage,
} from "@/lib/stores/order-counts-cold-breakdown";
import {
  buildStoreOpsMetaFromRow,
  type OwnerStoreOpsSnapshot,
} from "@/lib/stores/owner-store-ops-snapshot";
import { mapRpcSnapshotCounts } from "@/lib/stores/fetch-owner-store-order-counts-rpc";

export const OWNER_STORE_OPS_DASHBOARD_SNAPSHOT_RPC = "get_owner_store_ops_dashboard_snapshot";

export type DashboardSnapshotGate =
  | { ok: true; snapshot: OwnerStoreOpsSnapshot }
  | { ok: false; status: number; error: string };

function mapDashboardSnapshotPayload(data: unknown): DashboardSnapshotGate | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (d.ok === false) {
    const err = typeof d.error === "string" ? d.error : "forbidden";
    if (err === "store_not_found") return { ok: false, status: 404, error: err };
    return { ok: false, status: 403, error: err };
  }
  if (d.ok !== true) return null;
  const counts = mapRpcSnapshotCounts(d);
  if (!counts) return null;
  const store_ops = buildStoreOpsMetaFromRow({
    is_open: d.is_open as boolean | null,
    business_hours_json: d.business_hours_json,
  });
  return { ok: true, snapshot: { ...counts, store_ops } };
}

/** ownership + meta + counts — 단일 PostgREST RPC (내부 1 DB 호출) */
export async function fetchOwnerStoreOrderCountsDashboardSnapshot(
  sb: SupabaseClient<any>,
  storeId: string,
  userId: string,
  breakdown?: OrderCountsColdBreakdown
): Promise<DashboardSnapshotGate | null> {
  const sid = storeId.trim();
  const uid = userId.trim();
  if (!sid || !uid) return null;

  const rpc0 = Date.now();
  const { data, error } = await sb.rpc(OWNER_STORE_OPS_DASHBOARD_SNAPSHOT_RPC, {
    p_store_id: sid,
    p_user_id: uid,
  });
  const rpcWallMs = Date.now() - rpc0;
  if (breakdown) {
    breakdown.rpc_wall_ms = rpcWallMs;
    breakdown.ownership_check_ms = 0;
    breakdown.store_ops_meta_ms = 0;
  }

  if (error) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console -- dashboard snapshot deploy probe
      console.warn("[owner-store-ops-dashboard-snapshot-rpc-miss]", error.message, {
        rpc_wall_ms: rpcWallMs,
        store_id: sid,
      });
    }
    return null;
  }

  const parse0 = Date.now();
  const mapped = mapDashboardSnapshotPayload(data);
  const parseMs = Date.now() - parse0;
  if (breakdown) {
    breakdown.rpc_parse_ms = parseMs;
    try {
      breakdown.rpc_response_bytes = JSON.stringify(data ?? null).length;
    } catch {
      breakdown.rpc_response_bytes = 0;
    }
  }

  if (!mapped) return null;

  if (breakdown) breakdown.order_counts_slowest_stage = pickOrderCountsSlowestStage(breakdown);

  if (mapped.ok && process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console -- dashboard snapshot path verify
    console.info("[owner-store-ops-dashboard-snapshot-rpc-hit]", {
      store_id: sid,
      rpc_wall_ms: rpcWallMs,
      rpc_parse_ms: parseMs,
    });
  }

  return mapped;
}
