"use client";

import type { DevSprintsBundleV1 } from "@/lib/dev-sprints/dev-sprints-state";
import {
  exportDevSprintsBundle,
  importDevSprintsBundle,
} from "@/lib/dev-sprints/dev-sprints-state";

export async function loadDevSprintsFromServer(): Promise<{
  ok: boolean;
  source?: "db" | "default";
  error?: string;
}> {
  try {
    const res = await fetch("/api/admin/dev-sprints", { cache: "no-store" });
    const j = (await res.json()) as {
      ok?: boolean;
      bundle?: DevSprintsBundleV1;
      source?: "db" | "default";
      error?: string;
    };
    if (!res.ok || !j.ok || !j.bundle) {
      return { ok: false, error: j.error ?? "load_failed" };
    }
    importDevSprintsBundle(j.bundle);
    return { ok: true, source: j.source };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network" };
  }
}

export async function persistDevSprintsToServer(): Promise<{ ok: boolean; error?: string }> {
  try {
    const bundle = exportDevSprintsBundle();
    const res = await fetch("/api/admin/dev-sprints", {
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
