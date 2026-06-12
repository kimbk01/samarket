"use client";

import type { ProductionMigrationBundleV1 } from "@/lib/production-migration/production-migration-state";
import {
  exportProductionMigrationBundle,
  importProductionMigrationBundle,
} from "@/lib/production-migration/production-migration-state";

export async function loadProductionMigrationFromServer(): Promise<{
  ok: boolean;
  source?: "db" | "default";
  error?: string;
}> {
  try {
    const res = await fetch("/api/admin/production-migration", {
      cache: "no-store",
    });
    const j = (await res.json()) as {
      ok?: boolean;
      bundle?: ProductionMigrationBundleV1;
      source?: "db" | "default";
      error?: string;
    };
    if (!res.ok || !j.ok || !j.bundle) {
      return { ok: false, error: j.error ?? "load_failed" };
    }
    importProductionMigrationBundle(j.bundle);
    return { ok: true, source: j.source };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network" };
  }
}

export async function persistProductionMigrationToServer(): Promise<{
  ok: boolean;
  error?: string;
}> {
  try {
    const bundle = exportProductionMigrationBundle();
    const res = await fetch("/api/admin/production-migration", {
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
