/**
 * P0 — the legacy Pre-launch Reset HTTP API is retired.
 *
 * /api/admin/prelaunch-reset/{dry-run,execute} predate the Data Reset engine
 * (/api/admin/system/data-reset/*). The UI already redirects away, but the routes were
 * still reachable and the execute path could call auth.admin.deleteUser without a
 * one-time token, plan TTL or replay protection. Both routes now answer 410 before any
 * auth, body parsing or database access.
 */

export const PRELAUNCH_RESET_LEGACY_API_RETIRED = true as const;

export const PRELAUNCH_RESET_LEGACY_API_GONE_BODY = {
  ok: false,
  error: "prelaunch_reset_api_retired",
  replacement: "/admin/system/data-reset",
} as const;

export const PRELAUNCH_RESET_LEGACY_API_GONE_STATUS = 410 as const;
