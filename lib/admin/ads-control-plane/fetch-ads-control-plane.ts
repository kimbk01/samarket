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

export async function fetchAdsControlPlane(
  init?: RequestInit & { orderId?: string | null }
): Promise<AdsControlPlaneFetchResult> {
  try {
    const orderId = String(init?.orderId ?? "").trim();
    const qs = orderId ? `?orderId=${encodeURIComponent(orderId)}` : "";
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
