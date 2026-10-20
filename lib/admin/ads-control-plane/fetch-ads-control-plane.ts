/**
 * Typed client for GET /api/admin/ads-control-plane.
 * Envelope is always `{ ok: true, plane }` — never treat the envelope as the model.
 */

import type { AdsControlPlaneModel } from "@/lib/admin/ads-control-plane/types";

export type AdsControlPlaneFetchResult =
  | { ok: true; plane: AdsControlPlaneModel }
  | { ok: false; error: string; status?: number };

function isAdsControlPlaneModel(value: unknown): value is AdsControlPlaneModel {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (!v.queues || typeof v.queues !== "object") return false;
  if (!Array.isArray(v.occupancy)) return false;
  if (!Array.isArray(v.actionRequired)) return false;
  return true;
}

/**
 * Parse JSON body from ads-control-plane. Rejects envelope-as-model mistakes.
 */
export function parseAdsControlPlaneResponse(
  json: unknown,
  httpOk: boolean,
  status: number
): AdsControlPlaneFetchResult {
  if (!json || typeof json !== "object") {
    return { ok: false, error: "invalid_json", status };
  }
  const body = json as Record<string, unknown>;
  if (!httpOk || body.ok === false) {
    return {
      ok: false,
      error: typeof body.error === "string" ? body.error : "load_failed",
      status,
    };
  }
  const plane = body.plane;
  if (!isAdsControlPlaneModel(plane)) {
    return { ok: false, error: "invalid_plane_shape", status };
  }
  return { ok: true, plane };
}

/** R7 서버 페이지 조건 (`mode`·`status`·`family`·`limit`·`offset`). */
export type AdsControlPlanePageParams = {
  mode?: string;
  status?: string;
  family?: string;
  limit?: number;
  offset?: number;
};

export async function fetchAdsControlPlane(
  init?: RequestInit & { orderId?: string | null; storeId?: string | null; page?: AdsControlPlanePageParams }
): Promise<AdsControlPlaneFetchResult> {
  try {
    const params = new URLSearchParams();
    const orderId = String(init?.orderId ?? "").trim();
    if (orderId) params.set("orderId", orderId);
    /** Server-side store scope (`store_id`) — never filter the plane in the browser. */
    const storeId = String(init?.storeId ?? "").trim();
    if (storeId) params.set("store_id", storeId);
    const page = init?.page;
    if (page) {
      if (page.mode) params.set("mode", page.mode);
      if (page.status) params.set("status", page.status);
      if (page.family) params.set("family", page.family);
      if (typeof page.limit === "number") params.set("limit", String(page.limit));
      if (typeof page.offset === "number") params.set("offset", String(page.offset));
    }
    const qs = params.toString() ? `?${params.toString()}` : "";
    const headers = init?.headers;
    const signal = init?.signal;
    const res = await fetch(`/api/admin/ads-control-plane${qs}`, {
      cache: "no-store",
      credentials: "include",
      method: init?.method,
      headers,
      signal,
    });
    const json: unknown = await res.json().catch(() => null);
    return parseAdsControlPlaneResponse(json, res.ok, res.status);
  } catch {
    return { ok: false, error: "network" };
  }
}
