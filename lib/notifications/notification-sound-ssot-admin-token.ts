import { createHash, randomBytes } from "node:crypto";

const pending = new Map<string, { patches: unknown[]; expiresAt: number }>();
const TTL_MS = 5 * 60_000;

export function createConfirmToken(patches: unknown[]): string {
  const token = randomBytes(16).toString("hex");
  pending.set(token, { patches, expiresAt: Date.now() + TTL_MS });
  return token;
}

export function consumeConfirmToken(token: string): unknown[] | null {
  const entry = pending.get(token);
  pending.delete(token);
  if (!entry || entry.expiresAt < Date.now()) return null;
  return entry.patches;
}

export function diffMappings(
  current: Record<string, unknown>[],
  next: Record<string, unknown>[]
): { field: string; event_key: string; before: unknown; after: unknown }[] {
  const diffs: { field: string; event_key: string; before: unknown; after: unknown }[] = [];
  const curByKey = new Map(current.map((r) => [String(r.event_key), r]));
  for (const n of next) {
    const key = String(n.event_key);
    const c = curByKey.get(key);
    if (!c) {
      diffs.push({ field: "*", event_key: key, before: null, after: n });
      continue;
    }
    for (const f of ["asset_id", "use_device_default", "volume", "repeat_count", "enabled"] as const) {
      if (n[f] !== undefined && n[f] !== c[f]) {
        diffs.push({ field: f, event_key: key, before: c[f], after: n[f] });
      }
    }
  }
  return diffs;
}

export function hashPatches(patches: unknown[]): string {
  return createHash("sha256").update(JSON.stringify(patches)).digest("hex").slice(0, 16);
}
