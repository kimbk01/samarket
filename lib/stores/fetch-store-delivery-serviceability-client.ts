/**
 * Client fetch for store detail / cart — same SSOT as GET …/delivery-serviceability.
 * No Google; server evaluates haversine + effective policy.
 */
export type StoreDeliveryServiceabilityClientPayload = {
  ok: boolean;
  eligible?: boolean;
  applies?: boolean;
  reason?: string;
  distanceKm?: number | null;
  maxKm?: number | null;
  policyEnabled?: boolean;
  error?: string;
};

export async function fetchStoreDeliveryServiceabilityClient(
  slug: string,
  signal?: AbortSignal
): Promise<StoreDeliveryServiceabilityClientPayload> {
  const s = String(slug || "").trim();
  if (!s) return { ok: false, error: "missing_slug" };
  const res = await fetch(`/api/stores/${encodeURIComponent(s)}/delivery-serviceability`, {
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  const j = (await res.json().catch(() => ({}))) as StoreDeliveryServiceabilityClientPayload;
  if (!res.ok) {
    return { ok: false, error: typeof j.error === "string" ? j.error : `http_${res.status}` };
  }
  return j?.ok === true ? j : { ok: false, error: j.error || "bad_response" };
}

/** True when distance policy applies and this store is not deliverable to current address. */
export function isDeliveryDistanceOrderBlocked(
  svc: StoreDeliveryServiceabilityClientPayload | null
): boolean {
  if (!svc || svc.ok !== true) return false;
  return svc.applies === true && svc.eligible !== true;
}
