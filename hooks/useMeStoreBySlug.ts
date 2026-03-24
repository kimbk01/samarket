"use client";

import { useCallback, useEffect, useState } from "react";

export type MeStoreRow = {
  id: string;
  store_name: string;
  slug: string;
  store_categories?: { slug?: string; name?: string } | { slug?: string; name?: string }[] | null;
  store_topics?: { slug?: string; name?: string } | { slug?: string; name?: string }[] | null;
};

function embedOne<T extends { slug?: string }>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export function useMeStoreBySlug(slug: string) {
  const [state, setState] = useState<
    | { kind: "idle" | "loading" }
    | { kind: "unauth" }
    | { kind: "not_owner" }
    | { kind: "error"; message: string }
    | { kind: "ok"; store: MeStoreRow; primarySlug: string; subSlug: string | null }
  >({ kind: "loading" });

  const load = useCallback(async () => {
    const decoded = decodeURIComponent(slug || "").trim();
    if (!decoded) {
      setState({ kind: "not_owner" });
      return;
    }
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/me/stores", { credentials: "include", cache: "no-store" });
      if (res.status === 401) {
        setState({ kind: "unauth" });
        return;
      }
      const json = await res.json().catch(() => ({}));
      if (!json?.ok || !Array.isArray(json.stores)) {
        setState({ kind: "error", message: typeof json?.error === "string" ? json.error : "load_failed" });
        return;
      }
      const stores = json.stores as MeStoreRow[];
      const store = stores.find((s) => s.slug === decoded);
      if (!store) {
        setState({ kind: "not_owner" });
        return;
      }
      const cat = embedOne(store.store_categories ?? null);
      const top = embedOne(store.store_topics ?? null);
      setState({
        kind: "ok",
        store,
        primarySlug: cat?.slug ?? "biz",
        subSlug: top?.slug ?? null,
      });
    } catch {
      setState({ kind: "error", message: "network_error" });
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  return { state, reload: load };
}
