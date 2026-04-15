import { messengerMonitorRecord } from "@/lib/community-messenger/monitoring/client";

const STORAGE_KEY = "samarket:cm:home_return_t0.v1";
const TTL_MS = 20_000;

type Row = { at: number };

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
    if (!Number.isFinite(at)) return null;
    return { at };
  } catch {
    return null;
  }
}

/** 방 화면에서 홈(리스트)로 돌아가는 순간을 마킹한다. */
export function markCommunityMessengerHomeReturn(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ at: nowMs() } satisfies Row));
  } catch {
    /* ignore */
  }
}

/** 홈(리스트) 마운트 시 호출: 방→리스트 복귀 지연을 기록한다. */
export function consumeCommunityMessengerHomeReturn(): number | null {
  if (typeof window === "undefined") return null;
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
  if (!row) return null;
  const dt = Math.round(nowMs() - row.at);
  if (!Number.isFinite(dt) || dt < 0 || dt > TTL_MS) return null;
  messengerMonitorRecord({
    category: "chat.room_nav",
    metric: "room_to_list_mount",
    value: dt,
    unit: "ms",
  });
  return dt;
}

