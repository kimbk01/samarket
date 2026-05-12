/**
 * RSC `app/admin/page` — dev-safe 시 `buildAdminDashboardPayload` 15s 메모리 캐시.
 */
import { isDevSafeMode } from "@/lib/dev/is-dev-safe-mode";
import type { DashboardPayload } from "@/lib/types/admin-dashboard";
import { buildAdminDashboardPayload } from "@/lib/admin-dashboard/build-admin-dashboard-payload";

const TTL_MS = 15_000;
let entry: { adminId: string; expiresAt: number; data: DashboardPayload } | null = null;
let inflight: Promise<DashboardPayload> | null = null;

export async function getCachedAdminDashboardPayloadForDevSafe(adminId: string): Promise<DashboardPayload> {
  if (!isDevSafeMode()) {
    return buildAdminDashboardPayload();
  }
  const id = adminId.trim();
  const now = Date.now();
  if (entry && entry.adminId === id && entry.expiresAt > now) {
    return entry.data;
  }
  if (inflight) return inflight;
  inflight = buildAdminDashboardPayload()
    .then((data) => {
      entry = { adminId: id, expiresAt: Date.now() + TTL_MS, data };
      return data;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
