/**
 * 주문 직후 상세 화면 첫 페인트용 시드 — POST 응답 요약만 저장, TTL 후 폐기.
 */

import {
  dibayPerfRecordOrderDetailSeedCleared,
  dibayPerfRecordOrderDetailSeedSaved,
} from "@/lib/dibay/delivery-flow-perf";

export type StoreOrderDetailSeed = {
  id: string;
  order_no: string;
  store_id: string;
  store_name: string;
  order_status: string;
  payment_amount: number;
  total_amount: number;
  created_at: string;
  idempotent?: boolean;
};

const TTL_MS = 60_000;
const SS_PREFIX = "samarket:soddseed:v1:";

type Entry = { seed: StoreOrderDetailSeed; expiresAt: number };

const memory = new Map<string, Entry>();

function ssKey(orderId: string): string {
  return `${SS_PREFIX}${orderId}`;
}

function pruneMemory(): void {
  const now = Date.now();
  for (const [k, v] of memory) {
    if (v.expiresAt <= now) memory.delete(k);
  }
}

function readSession(orderId: string): Entry | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(ssKey(orderId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { seed?: StoreOrderDetailSeed; expiresAt?: number };
    if (!parsed.seed?.id || typeof parsed.expiresAt !== "number") return null;
    if (parsed.expiresAt <= Date.now()) {
      sessionStorage.removeItem(ssKey(orderId));
      return null;
    }
    return { seed: parsed.seed, expiresAt: parsed.expiresAt };
  } catch {
    return null;
  }
}

function writeSession(orderId: string, entry: Entry): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(ssKey(orderId), JSON.stringify(entry));
  } catch {
    /* quota */
  }
}

function removeSession(orderId: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(ssKey(orderId));
  } catch {
    /* ignore */
  }
}

/** 만료된 memory·session 항목 정리(가벼운 스윕) */
export function pruneExpiredStoreOrderDetailSeeds(): void {
  pruneMemory();
  if (typeof sessionStorage === "undefined") return;
  try {
    const now = Date.now();
    const toDrop: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (!k?.startsWith(SS_PREFIX)) continue;
      try {
        const raw = sessionStorage.getItem(k);
        if (!raw) continue;
        const { expiresAt } = JSON.parse(raw) as { expiresAt?: number };
        if (typeof expiresAt === "number" && expiresAt <= now) toDrop.push(k);
      } catch {
        toDrop.push(k);
      }
    }
    for (const k of toDrop) sessionStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

export function setStoreOrderDetailSeed(orderId: string, seed: StoreOrderDetailSeed): void {
  pruneExpiredStoreOrderDetailSeeds();
  const id = orderId.trim();
  if (!id || seed.id.trim() !== id) return;
  const expiresAt = Date.now() + TTL_MS;
  const entry: Entry = { seed: { ...seed, id }, expiresAt };
  memory.set(id, entry);
  writeSession(id, entry);
  dibayPerfRecordOrderDetailSeedSaved(id);
}

export function getStoreOrderDetailSeed(orderId: string): StoreOrderDetailSeed | null {
  pruneMemory();
  const id = orderId.trim();
  if (!id) return null;
  const fromMem = memory.get(id);
  if (fromMem && fromMem.expiresAt > Date.now()) {
    if (fromMem.seed.id !== id) return null;
    return { ...fromMem.seed };
  }
  if (fromMem) memory.delete(id);
  const fromSs = readSession(id);
  if (!fromSs || fromSs.seed.id !== id) return null;
  memory.set(id, fromSs);
  return { ...fromSs.seed };
}

export function clearStoreOrderDetailSeed(orderId: string): void {
  pruneMemory();
  const id = orderId.trim();
  if (!id) return;
  const hadMem = memory.has(id);
  let hadSs = false;
  if (typeof sessionStorage !== "undefined") {
    try {
      hadSs = sessionStorage.getItem(ssKey(id)) != null;
    } catch {
      /* ignore */
    }
  }
  memory.delete(id);
  removeSession(id);
  if (hadMem || hadSs) dibayPerfRecordOrderDetailSeedCleared(id);
}

export function buildStoreOrderDetailSeedFromPostSuccess(args: {
  orderId: string;
  order_no: string;
  payment_amount: number;
  store_id: string;
  store_name: string;
  idempotent?: boolean;
}): StoreOrderDetailSeed {
  const pa = Math.round(Number(args.payment_amount) || 0);
  const now = new Date().toISOString();
  return {
    id: args.orderId.trim(),
    order_no: String(args.order_no ?? "").trim(),
    store_id: args.store_id.trim(),
    store_name: String(args.store_name ?? "").trim() || "매장",
    order_status: "pending",
    payment_amount: pa,
    total_amount: pa,
    created_at: now,
    idempotent: args.idempotent,
  };
}
