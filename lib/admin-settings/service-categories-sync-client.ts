"use client";

import type { ServiceCategoriesBundleV1 } from "@/lib/admin-settings/service-categories-state";
import {
  exportServiceCategoriesBundle,
  importServiceCategoriesBundle,
} from "@/lib/admin-settings/service-categories-state";

export async function loadServiceCategoriesFromServer(): Promise<{
  ok: boolean;
  source?: "db" | "default";
  error?: string;
}> {
  try {
    const res = await fetch("/api/admin/service-categories", { cache: "no-store" });
    const j = (await res.json()) as {
      ok?: boolean;
      bundle?: ServiceCategoriesBundleV1;
      source?: "db" | "default";
      error?: string;
    };
    if (!res.ok || !j.ok || !j.bundle) {
      return { ok: false, error: j.error ?? "load_failed" };
    }
    importServiceCategoriesBundle(j.bundle);
    return { ok: true, source: j.source };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network" };
  }
}

export async function persistServiceCategoriesToServer(): Promise<{ ok: boolean; error?: string }> {
  try {
    const bundle = exportServiceCategoriesBundle();
    const res = await fetch("/api/admin/service-categories", {
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
