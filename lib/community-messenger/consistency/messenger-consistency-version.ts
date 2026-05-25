/**
 * Client-side merge truth versions — monotonic ms from ISO timestamps.
 * DB `snapshot_version` column 없음 — `updated_at` / `lastMessageAt` / read ack 시각으로 대체.
 */
import { normalizeLocalReadGuardRoomId } from "@/lib/community-messenger/read/local-read-guard";

export type MessengerConsistencySurface =
  | "home_sync"
  | "room_bootstrap"
  | "hub_badge"
  | "room_list"
  | "realtime"
  | "cross_tab"
  | "reconnect"
  | "notification";

type RoomTruthRow = {
  versionMs: number;
  source: string;
  updatedAtIso: string;
};

const roomTruth = new Map<string, RoomTruthRow>();
const surfaceSnapshotVersionMs = new Map<MessengerConsistencySurface, number>();
const appliedEventKeys = new Map<string, number>();

let reconnectPreservedVersionMs = 0;
let reconnectAtMs = 0;

const DUPLICATE_EVENT_TTL_MS = 30_000;

export function versionMsFromIso(...values: (string | null | undefined)[]): number {
  let max = 0;
  for (const v of values) {
    const t = Date.parse(String(v ?? "").trim());
    if (Number.isFinite(t) && t > max) max = t;
  }
  return max;
}

export function bumpRoomTruthVersion(
  roomId: string,
  versionMs: number,
  source: string
): number {
  const rid = normalizeLocalReadGuardRoomId(roomId);
  if (!rid || !Number.isFinite(versionMs) || versionMs <= 0) return getRoomTruthVersionMs(rid);
  const prev = roomTruth.get(rid);
  const nextMs = Math.max(prev?.versionMs ?? 0, Math.floor(versionMs));
  if (!prev || nextMs >= prev.versionMs) {
    roomTruth.set(rid, {
      versionMs: nextMs,
      source,
      updatedAtIso: new Date(nextMs).toISOString(),
    });
  }
  return getRoomTruthVersionMs(rid);
}

export function getRoomTruthVersionMs(roomId: string): number {
  const rid = normalizeLocalReadGuardRoomId(roomId);
  return rid ? (roomTruth.get(rid)?.versionMs ?? 0) : 0;
}

export function setSurfaceSnapshotVersionMs(surface: MessengerConsistencySurface, versionMs: number): void {
  if (!Number.isFinite(versionMs) || versionMs <= 0) return;
  const prev = surfaceSnapshotVersionMs.get(surface) ?? 0;
  if (versionMs >= prev) surfaceSnapshotVersionMs.set(surface, Math.floor(versionMs));
}

export function getSurfaceSnapshotVersionMs(surface: MessengerConsistencySurface): number {
  return surfaceSnapshotVersionMs.get(surface) ?? 0;
}

export function noteReconnectTruthPreserve(): void {
  let max = 0;
  for (const row of roomTruth.values()) {
    if (row.versionMs > max) max = row.versionMs;
  }
  for (const v of surfaceSnapshotVersionMs.values()) {
    if (v > max) max = v;
  }
  reconnectPreservedVersionMs = max;
  reconnectAtMs = Date.now();
}

export function getReconnectPreservedVersionMs(): number {
  return reconnectPreservedVersionMs;
}

export function shouldDiscardReconnectPayload(incomingVersionMs: number): boolean {
  if (reconnectPreservedVersionMs <= 0) return false;
  if (!Number.isFinite(incomingVersionMs) || incomingVersionMs <= 0) return false;
  return incomingVersionMs < reconnectPreservedVersionMs;
}

/** true = duplicate (skip apply) */
export function markDuplicateConsistencyEvent(eventKey: string): boolean {
  const key = String(eventKey ?? "").trim();
  if (!key) return false;
  const now = Date.now();
  for (const [k, at] of appliedEventKeys) {
    if (now - at > DUPLICATE_EVENT_TTL_MS) appliedEventKeys.delete(k);
  }
  const prev = appliedEventKeys.get(key);
  if (prev != null && now - prev < DUPLICATE_EVENT_TTL_MS) return true;
  appliedEventKeys.set(key, now);
  return false;
}

export function clearMessengerConsistencyStateForTests(): void {
  roomTruth.clear();
  surfaceSnapshotVersionMs.clear();
  appliedEventKeys.clear();
  reconnectPreservedVersionMs = 0;
  reconnectAtMs = 0;
}
