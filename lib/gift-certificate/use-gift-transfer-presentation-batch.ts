"use client";

import { useEffect, useState } from "react";
import type { GiftTransferPresentation } from "@/lib/gift-certificate/load-gift-transfer-presentations";

const cache = new Map<string, GiftTransferPresentation>();
const pending = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

async function flushBatch() {
  const ids = [...pending];
  pending.clear();
  flushTimer = null;
  if (!ids.length) return;
  try {
    const res = await fetch("/api/me/gift-certificates/transfers/presentation", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transferIds: ids }),
    });
    const json = (await res.json()) as {
      ok?: boolean;
      items?: GiftTransferPresentation[];
    };
    if (json.ok && json.items) {
      for (const item of json.items) {
        cache.set(item.transferId, item);
      }
      notify();
    }
  } catch {
    // presentation enrichment is best-effort
  }
}

function schedule(transferId: string) {
  if (cache.has(transferId)) return;
  pending.add(transferId);
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    void flushBatch();
  }, 0);
}

/** G4 — registers transfer id into one batched presentation fetch per flush. */
export function useGiftTransferPresentation(transferId: string | null | undefined) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const listener = () => setTick((v) => v + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    const id = transferId?.trim();
    if (!id) return;
    schedule(id);
  }, [transferId]);

  if (!transferId?.trim()) return null;
  void tick;
  return cache.get(transferId.trim()) ?? null;
}
