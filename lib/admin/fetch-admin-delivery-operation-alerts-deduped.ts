import { runSingleFlight } from "@/lib/http/run-single-flight";

export type AdminDeliveryOperationAlertsResult = {
  status: number;
  json: unknown | null;
};

export function fetchAdminDeliveryOperationAlertsDeduped(
  eventStatus: "open" | "all" | "resolved" | "acknowledged" | "muted" = "open",
  assignment: "all" | "mine" | "unassigned" = "all"
): Promise<AdminDeliveryOperationAlertsResult> {
  const key = `admin:delivery-operation-alerts:${eventStatus}:${assignment}`;
  const qs = new URLSearchParams({
    event_status: eventStatus,
    assignment,
  });
  return runSingleFlight(key, () =>
    fetch(`/api/admin/delivery-operation-alerts?${qs.toString()}`, {
      cache: "no-store",
    })
  ).then(async (res): Promise<AdminDeliveryOperationAlertsResult> => {
    if (!res.ok) return { status: res.status, json: null };
    const json: unknown = await res.clone().json().catch(() => null);
    return { status: res.status, json };
  });
}
