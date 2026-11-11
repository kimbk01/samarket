"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { moimApi } from "@/lib/moim/moim-client-api";
import type { MoimCardDto } from "@/lib/moim/moim-api-types";

export type MoimLocalListState = {
  status: "idle" | "loading" | "ready" | "error";
  items: MoimCardDto[];
  hasAddress: boolean;
  nextBefore: string | null;
  loadingMore: boolean;
  reload: () => void;
  loadMore: () => void;
};

/** 우리 동네 모임 목록 — 카테고리·검색어가 바뀌면 처음부터, 「더 보기」는 nextBefore */
export function useMoimLocalList(q: { category?: string | null; q?: string | null; enabled?: boolean }): MoimLocalListState {
  const enabled = q.enabled !== false;
  const [status, setStatus] = useState<MoimLocalListState["status"]>("idle");
  const [items, setItems] = useState<MoimCardDto[]>([]);
  const [hasAddress, setHasAddress] = useState(true);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const seq = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setStatus("idle");
      setItems([]);
      setNextBefore(null);
      return;
    }
    const my = ++seq.current;
    setStatus("loading");
    void moimApi.listLocal({ category: q.category, q: q.q }).then((r) => {
      if (my !== seq.current) return;
      if (!r.ok) {
        setStatus("error");
        return;
      }
      setItems(r.items);
      setHasAddress(r.hasAddress);
      setNextBefore(r.nextBefore);
      setStatus("ready");
    });
  }, [enabled, q.category, q.q, reloadKey]);

  const loadMore = useCallback(() => {
    if (!nextBefore || loadingMore) return;
    const my = seq.current;
    setLoadingMore(true);
    void moimApi.listLocal({ category: q.category, q: q.q, before: nextBefore }).then((r) => {
      setLoadingMore(false);
      if (my !== seq.current || !r.ok) return;
      setItems((prev) => {
        const seen = new Set(prev.map((x) => x.id));
        return [...prev, ...r.items.filter((x) => !seen.has(x.id))];
      });
      setNextBefore(r.nextBefore);
    });
  }, [nextBefore, loadingMore, q.category, q.q]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  return { status, items, hasAddress, nextBefore, loadingMore, reload, loadMore };
}
