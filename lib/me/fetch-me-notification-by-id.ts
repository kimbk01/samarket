/**
 * INAPP-03 — Notification Center detail: one row by id (`GET /api/me/notifications/:id`).
 * Never cached on the client — ownership is checked per request on the server.
 */
export type MeNotificationByIdResult = { status: number; json: unknown };

export function buildMeNotificationByIdUrl(notificationId: string): string {
  return `/api/me/notifications/${encodeURIComponent(String(notificationId ?? "").trim())}`;
}

export async function fetchMeNotificationById(notificationId: string): Promise<MeNotificationByIdResult> {
  const id = String(notificationId ?? "").trim();
  if (!id) return { status: 404, json: { ok: false, error: "not_found" } };
  const res = await fetch(buildMeNotificationByIdUrl(id), {
    credentials: "include",
    cache: "no-store",
  });
  const json: unknown = await res.json().catch(() => ({}));
  return { status: res.status, json };
}
