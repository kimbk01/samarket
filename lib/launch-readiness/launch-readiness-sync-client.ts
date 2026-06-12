"use client";

import type { LaunchReadinessBundleV1 } from "@/lib/launch-readiness/launch-readiness-state";
import {
  exportLaunchReadinessBundle,
  importLaunchReadinessBundle,
} from "@/lib/launch-readiness/launch-readiness-state";

export async function loadLaunchReadinessFromServer(): Promise<{
  ok: boolean;
  source?: "db" | "default";
  error?: string;
}> {
  try {
    const res = await fetch("/api/admin/launch-readiness", { cache: "no-store" });
    const j = (await res.json()) as {
      ok?: boolean;
      bundle?: LaunchReadinessBundleV1;
      source?: "db" | "default";
      error?: string;
    };
    if (!res.ok || !j.ok || !j.bundle) {
      return { ok: false, error: j.error ?? "load_failed" };
    }
    importLaunchReadinessBundle(j.bundle);
    return { ok: true, source: j.source };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network" };
  }
}

export async function persistLaunchReadinessToServer(): Promise<{
  ok: boolean;
  error?: string;
}> {
  try {
    const bundle = exportLaunchReadinessBundle();
    const res = await fetch("/api/admin/launch-readiness", {
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
