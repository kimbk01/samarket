/**
 * POST trade-chat-list-meta — 동일 userId+roomIds 에 대한 in-flight 합류.
 * dev-safe 에서만 완료 응답 10s 메모리 재사용.
 */
import { isDevSafeMode } from "@/lib/dev/is-dev-safe-mode";

const DEV_TTL_MS = 10_000;
const MAX_KEYS = 80;

type Patch = { roomId: string; contextMeta: unknown };

function cacheKey(userId: string, roomIds: string[]): string {
  const u = userId.trim();
  const ids = [...new Set(roomIds.map((x) => x.trim()).filter(Boolean))].sort();
  return `${u}\0${ids.join(",")}`;
}

const devValue = new Map<string, { expiresAt: number; value: Patch[] }>();
const inflight = new Map<string, Promise<Patch[]>>();

function pruneDev(): void {
  const now = Date.now();
  for (const [k, v] of devValue) {
    if (v.expiresAt <= now) devValue.delete(k);
  }
  while (devValue.size > MAX_KEYS) {
    const first = devValue.keys().next().value;
    if (first === undefined) break;
    devValue.delete(first);
  }
}

export async function runTradeChatListMetaWithDedupe(
  userId: string,
  roomIds: string[],
  compute: () => Promise<Patch[]>
): Promise<Patch[]> {
  const key = cacheKey(userId, roomIds);
  const now = Date.now();

  if (isDevSafeMode()) {
    pruneDev();
    const hit = devValue.get(key);
    if (hit && hit.expiresAt > now) {
      return hit.value;
    }
  }

  const existing = inflight.get(key);
  if (existing) return existing;

  const p = compute()
    .then((value) => {
      if (isDevSafeMode()) {
        devValue.set(key, { expiresAt: Date.now() + DEV_TTL_MS, value });
      }
      return value;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, p);
  return p;
}
