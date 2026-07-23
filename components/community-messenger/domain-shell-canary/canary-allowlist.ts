/**
 * Client-safe Domain Home wiring helpers (no @/lib/messenger import).
 * All authenticated viewers use Domain shell Home (Production Wiring).
 */

/** Historical canary UUID — diagnostics only when ALL_USER is off */
export const DOMAIN_SHELL_READ_UI_CANARY_VIEWER_IDS = [
  "35dd245c-d398-4ea3-93a0-c0eda37cc777",
] as const;

/** Production: Domain shell Home for every authenticated viewer */
export const DOMAIN_SHELL_ALL_USER_HOME_WIRING = true as const;

export type ClientDomainReadBundle = "inbox" | "trade" | "store_order_customer";

/** Mirror server DOMAIN_READ_BUNDLE_KILL_TTL_MS — sessionStorage must not stick forever. */
export const CLIENT_DOMAIN_READ_BUNDLE_KILL_TTL_MS = 45_000 as const;

const KILLED_KEY = "samarket:domain-read-canary:killed-bundles.v1";

type KilledEntry = { bundle: ClientDomainReadBundle; at: number };

export function isDomainShellReadUiCanaryViewer(userId: string | null | undefined): boolean {
  const id = userId?.trim() ?? "";
  if (!id) return false;
  if (DOMAIN_SHELL_ALL_USER_HOME_WIRING) return true;
  return (DOMAIN_SHELL_READ_UI_CANARY_VIEWER_IDS as readonly string[]).includes(id);
}

function isBundleName(x: unknown): x is ClientDomainReadBundle {
  return x === "inbox" || x === "trade" || x === "store_order_customer";
}

function parseKilledEntries(raw: string | null, now: number): KilledEntry[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    const out: KilledEntry[] = [];
    for (const x of arr) {
      // Legacy shape: ["store_order_customer", ...] — treat as just-killed (expire via TTL from now? no — unknown age → expire immediately so we re-validate)
      if (typeof x === "string" && isBundleName(x)) {
        // Unknown age from pre-TTL sessions: do not stick forever — drop on read.
        continue;
      }
      if (x && typeof x === "object" && isBundleName((x as KilledEntry).bundle)) {
        const at = Number((x as KilledEntry).at);
        if (!Number.isFinite(at)) continue;
        if (now - at >= CLIENT_DOMAIN_READ_BUNDLE_KILL_TTL_MS) continue;
        out.push({ bundle: (x as KilledEntry).bundle, at });
      }
    }
    return out;
  } catch {
    return [];
  }
}

function writeKilledEntries(entries: KilledEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    if (entries.length === 0) {
      sessionStorage.removeItem(KILLED_KEY);
      return;
    }
    sessionStorage.setItem(KILLED_KEY, JSON.stringify(entries));
  } catch {
    /* ignore */
  }
}

export function readClientKilledBundles(now = Date.now()): Set<ClientDomainReadBundle> {
  if (typeof window === "undefined") return new Set();
  const entries = parseKilledEntries(sessionStorage.getItem(KILLED_KEY), now);
  // Persist pruned list so expired kills do not linger.
  writeKilledEntries(entries);
  return new Set(entries.map((e) => e.bundle));
}

export function markClientBundleKilled(bundle: ClientDomainReadBundle, now = Date.now()): void {
  if (typeof window === "undefined") return;
  const next = parseKilledEntries(sessionStorage.getItem(KILLED_KEY), now).filter(
    (e) => e.bundle !== bundle
  );
  next.push({ bundle, at: now });
  writeKilledEntries(next);
}

export function isClientBundleKilled(bundle: ClientDomainReadBundle, now = Date.now()): boolean {
  return readClientKilledBundles(now).has(bundle);
}

export function clearClientBundleKilled(bundle?: ClientDomainReadBundle): void {
  if (typeof window === "undefined") return;
  try {
    if (!bundle) {
      sessionStorage.removeItem(KILLED_KEY);
      return;
    }
    const now = Date.now();
    const next = parseKilledEntries(sessionStorage.getItem(KILLED_KEY), now).filter(
      (e) => e.bundle !== bundle
    );
    writeKilledEntries(next);
  } catch {
    /* ignore */
  }
}

export async function requestServerBundleKill(bundle: ClientDomainReadBundle): Promise<void> {
  markClientBundleKilled(bundle);
  try {
    await fetch("/api/messenger/domain-read/kill", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bundle, action: "kill" }),
      cache: "no-store",
    });
  } catch {
    /* client kill still applies */
  }
}

export async function requestServerBundleRestore(bundle: ClientDomainReadBundle): Promise<void> {
  clearClientBundleKilled(bundle);
  try {
    await fetch("/api/messenger/domain-read/kill", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bundle, action: "restore" }),
      cache: "no-store",
    });
  } catch {
    /* ignore */
  }
}
