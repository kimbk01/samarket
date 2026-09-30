import type { AdminUser } from "@/lib/types/admin-user";

/**
 * Admin moderation display status.
 * - blocked = 이용 차단 (PII kept, login deny, recoverable)
 * - withdrawn = 탈퇴 완료 (anonymized; no admin restore CTA)
 * - banned = legacy alias for blocked (read compat only)
 */
export function mapProfileStatusToModeration(
  status: string | null | undefined,
  deletedAt: string | null | undefined,
  hasRecentWarn: boolean
): AdminUser["moderationStatus"] {
  const normalized = String(status ?? "").trim().toLowerCase();
  // WITHDRAWN first — deleted_at / status=deleted must never look like recoverable block.
  if (deletedAt || normalized === "deleted" || normalized === "withdrawn" || normalized === "deactivated") {
    return "withdrawn";
  }
  if (normalized === "blocked") return "blocked";
  // Legacy rows that used ban→deleted without deleted_at still surface as withdrawn above.
  if (normalized === "banned") return "blocked";
  if (!normalized || normalized === "active" || normalized === "sns_pending" || normalized === "verified_user") {
    return hasRecentWarn ? "warned" : "normal";
  }
  if (normalized === "suspended") return "suspended";
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
      // V1: indefinite only — no expires_at.
      return { status: "suspended" };
    case "ban":
      // P0: BLOCKED ≠ deleted. PII retained. deleted_at must stay null.
      return { status: "blocked", deleted_at: null };
    case "restore":
      // Only for suspended / blocked — route must reject withdrawn.
      return { status: "verified_user", deleted_at: null, deletion_requested_at: null };
  }
}
