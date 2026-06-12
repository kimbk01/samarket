"use client";

import type { LaunchWeekBundleV1 } from "@/lib/launch-week/launch-week-state";
import {
  exportLaunchWeekBundle,
  importLaunchWeekBundle,
} from "@/lib/launch-week/launch-week-state";

export async function loadLaunchWeekFromServer(): Promise<{
  ok: boolean;
  source?: "db" | "default";
  error?: string;
}> {
  try {
    const res = await fetch("/api/admin/launch-week", { cache: "no-store" });
    const j = (await res.json()) as {
      ok?: boolean;
      bundle?: LaunchWeekBundleV1;
      source?: "db" | "default";
      error?: string;
    };
    if (!res.ok || !j.ok || !j.bundle) {
      return { ok: false, error: j.error ?? "load_failed" };
    }
    importLaunchWeekBundle(j.bundle);
    return { ok: true, source: j.source };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network" };
  }
}

export async function persistLaunchWeekToServer(): Promise<{
  ok: boolean;
  error?: string;
}> {
  try {
    const bundle = exportLaunchWeekBundle();
    const res = await fetch("/api/admin/launch-week", {
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
