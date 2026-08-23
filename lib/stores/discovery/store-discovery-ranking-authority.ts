/**
 * CUT 8 — ONE server-side store discovery ranking authority switch.
 *
 * Default after cutover: NEW (bounded Gi×Dj wave RPC).
 * Rollback (deployment/config only): STORE_DISCOVERY_RANKING_AUTHORITY=old
 *
 * Forbidden: request-level silent OLD fallback when NEW fails.
 */

export type StoreDiscoveryRankingAuthority = "old" | "new";

export const STORE_DISCOVERY_RANKING_AUTHORITY_ENV = "STORE_DISCOVERY_RANKING_AUTHORITY";

/** Post-CUT8 product default — NEW is SSOT for HOME/BROWSE ranking. */
export const STORE_DISCOVERY_RANKING_AUTHORITY_DEFAULT: StoreDiscoveryRankingAuthority = "new";

export function resolveStoreDiscoveryRankingAuthority(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): StoreDiscoveryRankingAuthority {
  const raw = String(env[STORE_DISCOVERY_RANKING_AUTHORITY_ENV] ?? "")
    .trim()
    .toLowerCase();
  if (raw === "old") return "old";
  if (raw === "new") return "new";
  return STORE_DISCOVERY_RANKING_AUTHORITY_DEFAULT;
}

export function isStoreDiscoveryRankingAuthorityNew(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): boolean {
  return resolveStoreDiscoveryRankingAuthority(env) === "new";
}

export type StoreDiscoveryAuthorityRuntimeEvent = {
  surface: "home" | "browse";
  authority: StoreDiscoveryRankingAuthority;
  status: "ok" | "unavailable" | "error" | "old_path";
  wavesExecuted?: number;
  rowsReturned?: number;
  error?: string;
};

/** Safe observability for Production authority proof — no PII. */
export function logStoreDiscoveryAuthorityRuntime(event: StoreDiscoveryAuthorityRuntimeEvent): void {
  console.info(
    "[store-discovery-authority]",
    JSON.stringify({
      surface: event.surface,
      authority: event.authority,
      status: event.status,
      wavesExecuted: event.wavesExecuted ?? null,
      rowsReturned: event.rowsReturned ?? null,
      error: event.error ? String(event.error).slice(0, 200) : null,
    })
  );
}
