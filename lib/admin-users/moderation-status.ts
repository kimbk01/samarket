import type { AdminUser } from "@/lib/types/admin-user";

export function mapProfileStatusToModeration(
  status: string | null | undefined,
  deletedAt: string | null | undefined,
  hasRecentWarn: boolean
): AdminUser["moderationStatus"] {
  if (deletedAt) return "banned";
  const normalized = String(status ?? "").trim().toLowerCase();
  if (!normalized || normalized === "active" || normalized === "sns_pending" || normalized === "verified_user") {
    return hasRecentWarn ? "warned" : "normal";
  }
  if (normalized === "suspended" || normalized === "blocked") return "suspended";
  if (normalized === "deleted" || normalized === "banned") return "banned";
  if (normalized === "warned" || normalized === "warning") return "warned";
  return hasRecentWarn ? "warned" : "normal";
}

export function moderationActionToProfilePatch(
  action: "warn" | "suspend" | "ban" | "restore"
): Record<string, unknown> | null {
  switch (action) {
    case "warn":
      return null;
    case "suspend":
      return { status: "suspended" };
    case "ban":
      return { status: "deleted", deleted_at: new Date().toISOString() };
    case "restore":
      return { status: "verified_user", deleted_at: null, deletion_requested_at: null };
  }
}
