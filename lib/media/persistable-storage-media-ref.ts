/**
 * Persistable / fetchable media refs for DIBAY Storage.
 * blob / localhost / opaque schemes must never become canonical DB paths
 * and must never be prefixed onto /storage/v1/object/public/.
 */

const BLOCKED_SCHEMES = [
  "blob:",
  "file:",
  "data:",
  "capacitor:",
  "content:",
  "javascript:",
] as const;

function isBlockedHostname(hostname: string): boolean {
  const h = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!h) return true;
  if (h === "localhost" || h === "0.0.0.0" || h === "::1" || h === "[::1]") return true;
  if (h.endsWith(".localhost") || h.endsWith(".local")) return true;
  if (h === "127.0.0.1") return true;
  return false;
}

export function isPersistableStorageMediaRef(raw: string | null | undefined): boolean {
  const u = typeof raw === "string" ? raw.trim() : "";
  if (!u) return false;
  if (u === "undefined" || u === "null" || u === "[object Object]") return false;
  const lower = u.toLowerCase();
  if (BLOCKED_SCHEMES.some((s) => lower.startsWith(s))) return false;
  if (u.includes("..")) return false;

  if (/^https?:\/\//i.test(u)) {
    try {
      const parsed = new URL(u);
      if (isBlockedHostname(parsed.hostname)) return false;
      return true;
    } catch {
      return false;
    }
  }

  if (u.startsWith("//")) return false;
  return true;
}

export function filterPersistableStorageMediaRefs(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string" && isPersistableStorageMediaRef(x));
}
