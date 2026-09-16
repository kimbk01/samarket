/**
 * Map Postgres unique_violation (23505) on public.stores inserts to business errors.
 * Owner-user unique → already_has_active_application (one account = one store).
 * Slug unique → slug_collision.
 */
export function classifyStoresInsertUniqueViolation(err: {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  constraint?: string | null;
}): "already_has_active_application" | "slug_collision" | null {
  if (String(err?.code ?? "") !== "23505") return null;
  const blob = `${err.constraint ?? ""} ${err.message ?? ""} ${err.details ?? ""}`.toLowerCase();
  if (
    blob.includes("stores_one_owner_one_store_uidx") ||
    blob.includes("owner_user_id") ||
    /key\s*\(\s*owner_user_id\s*\)/.test(blob)
  ) {
    return "already_has_active_application";
  }
  if (blob.includes("slug") || /key\s*\(\s*slug\s*\)/.test(blob)) {
    return "slug_collision";
  }
  // Prefer one-store contract over opaque slug error when ambiguous.
  return "already_has_active_application";
}
