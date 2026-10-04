/** Client-safe helpers for selected_users target_payload (DEF-03). */

export function normalizeSelectedUserIds(ids: string[] | undefined | null): string[] {
  if (!Array.isArray(ids)) return [];
  return [
    ...new Set(
      ids
        .map((x) => String(x ?? "").trim())
        .filter((id) => id.length > 0)
    ),
  ].slice(0, 5000);
}

/** Reads persisted IDs from target_payload.selected_user_ids. */
export function readSelectedUserIdsFromPayload(payload: unknown): string[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const raw = (payload as Record<string, unknown>).selected_user_ids;
  if (!Array.isArray(raw)) return [];
  return normalizeSelectedUserIds(raw.map((x) => String(x ?? "")));
}
