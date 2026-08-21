"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SAMARKET_ADDRESSES_UPDATED_EVENT } from "@/components/addresses/MandatoryAddressGate";

export type DeliverySearchStore = {
  id: string;
  slug: string;
  store_name: string;
  description: string | null;
  profile_image_url: string | null;
  rating_avg: number | null;
  review_count: number | null;
  district: string | null;
  city: string | null;
  region: string | null;
};

export type DeliverySearchMenu = {
  id: string;
  store_id: string;
  store_slug: string;
  store_name: string;
  title: string;
  summary: string | null;
  price: number;
  discount_price: number | null;
  thumbnail_url: string | null;
};

type SearchResponse = {
  ok: boolean;
  stores: DeliverySearchStore[];
  menus: DeliverySearchMenu[];
  result_count: number;
};

export function normalizeDeliverySearchKeyword(input: string): string {
  return input.trim().replace(/\s+/g, " ").slice(0, 60);
}

export function useDeliveryStoreSearch(debounceMs = 250) {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [stores, setStores] = useState<DeliverySearchStore[]>([]);
  const [menus, setMenus] = useState<DeliverySearchMenu[]>([]);
  const [resultCount, setResultCount] = useState(0);
  const searchAbortRef = useRef<AbortController | null>(null);

  const trimmed = useMemo(() => normalizeDeliverySearchKeyword(q), [q]);
  const showResults = debouncedQ.trim().length >= 1;

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(trimmed), debounceMs);
    return () => window.clearTimeout(t);
  }, [trimmed, debounceMs]);

  const runSearch = useCallback(async (keyword: string) => {
    const k = normalizeDeliverySearchKeyword(keyword);
    if (k.length < 1) {
      setStores([]);
      setMenus([]);
      setResultCount(0);
      return;
    }

    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;

    setLoading(true);
    try {
      const res = await fetch(`/api/stores/search?q=${encodeURIComponent(k)}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const j = (await res.json().catch(() => ({}))) as SearchResponse;
      if (controller.signal.aborted) return;
      setStores(Array.isArray(j.stores) ? j.stores : []);
      setMenus(Array.isArray(j.menus) ? j.menus : []);
      setResultCount(Number.isFinite(Number(j.result_count)) ? Number(j.result_count) : 0);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setStores([]);
      setMenus([]);
      setResultCount(0);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debouncedQ.trim().length < 1) return;
    void runSearch(debouncedQ);
  }, [debouncedQ, runSearch]);

  useEffect(() => {
    const onAddressesUpdated = () => {
      if (debouncedQ.trim().length < 1) return;
      void runSearch(debouncedQ);
    };
    window.addEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onAddressesUpdated);
    return () => window.removeEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onAddressesUpdated);
  }, [debouncedQ, runSearch]);

  const reset = useCallback(() => {
    searchAbortRef.current?.abort();
    setQ("");
    setDebouncedQ("");
    setStores([]);
    setMenus([]);
    setResultCount(0);
    setLoading(false);
  }, []);

  const submit = useCallback(
    (keyword: string) => {
      const k = normalizeDeliverySearchKeyword(keyword);
      setQ(k);
      void runSearch(k);
    },
    [runSearch]
  );

  const pickKeyword = useCallback(
    (keyword: string) => {
      const k = normalizeDeliverySearchKeyword(keyword);
      setQ(k);
      void runSearch(k);
    },
    [runSearch]
  );

  return {
    q,
    setQ,
    debouncedQ,
    trimmed,
    showResults,
    loading,
    stores,
    menus,
    resultCount,
    reset,
    submit,
    pickKeyword,
  };
}
