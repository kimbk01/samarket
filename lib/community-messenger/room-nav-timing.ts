import { messengerMonitorRecord } from "@/lib/community-messenger/monitoring/client";

const STORAGE_KEY = "samarket:cm:room_nav_t0.v1";
const TTL_MS = 15_000;

type Row = { at: number; roomId: string };

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function safeParse(raw: string | null): Row | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== "object") return null;
    const r = o as Record<string, unknown>;
    const at = Number(r.at);
    const roomId = typeof r.roomId === "string" ? r.roomId : "";
    if (!Number.isFinite(at) || !roomId.trim()) return null;
    return { at, roomId };
  } catch {
    return null;
  }
}

/**
 * 목록 셀 탭 시각을 저장 → 방 페이지 마운트에서 읽어 탭→마운트 지연을 측정.
 * (메인스레드 멈칫/리렌더/라우터 스케줄링 지연을 잡아낸다.)
 */
export function markCommunityMessengerRoomNavTap(roomId: string): void {
  if (typeof window === "undefined") return;
  const id = String(roomId ?? "").trim();
  if (!id) return;
  const row: Row = { at: nowMs(), roomId: id };
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(row));
  } catch {
    /* ignore */
  }
}

/**
 * 방 페이지 마운트 시 호출: 탭→마운트 지연을 기록하고 저장 값을 소모.
 */
export function consumeCommunityMessengerRoomNavTap(roomId: string): number | null {
  if (typeof window === "undefined") return null;
  const id = String(roomId ?? "").trim();
  if (!id) return null;
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  const row = safeParse(raw);
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  if (!row || row.roomId !== id) return null;
  const dt = Math.round(nowMs() - row.at);
  if (!Number.isFinite(dt) || dt < 0 || dt > TTL_MS) return null;
  messengerMonitorRecord({
    category: "chat.room_nav",
    metric: "tap_to_mount",
    value: dt,
    unit: "ms",
    labels: { roomIdSuffix: id.length <= 8 ? id : id.slice(-8) },
  });
  return dt;
}

