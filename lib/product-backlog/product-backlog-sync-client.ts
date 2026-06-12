"use client";

import type { ProductBacklogBundleV1 } from "@/lib/product-backlog/product-backlog-state";
import {
  exportProductBacklogBundle,
  importProductBacklogBundle,
} from "@/lib/product-backlog/product-backlog-state";

export async function loadProductBacklogFromServer(): Promise<{
  ok: boolean;
  source?: "db" | "default";
  error?: string;
}> {
  try {
    const res = await fetch("/api/admin/product-backlog", { cache: "no-store" });
    const j = (await res.json()) as {
      ok?: boolean;
      bundle?: ProductBacklogBundleV1;
      source?: "db" | "default";
      error?: string;
    };
    if (!res.ok || !j.ok || !j.bundle) {
      return { ok: false, error: j.error ?? "load_failed" };
    }
    importProductBacklogBundle(j.bundle);
    return { ok: true, source: j.source };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network" };
  }
}

export async function persistProductBacklogToServer(): Promise<{ ok: boolean; error?: string }> {
  try {
    const bundle = exportProductBacklogBundle();
    const res = await fetch("/api/admin/product-backlog", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bundle }),
    });
    const j = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !j.ok) {
      return { ok: false, error: j.error ?? "save_failed" };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network" };
  }
}
