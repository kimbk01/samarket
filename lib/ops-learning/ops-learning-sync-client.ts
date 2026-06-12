"use client";

import type { OpsLearningBundleV1 } from "@/lib/ops-learning/ops-learning-state";
import {
  exportOpsLearningBundle,
  importOpsLearningBundle,
} from "@/lib/ops-learning/ops-learning-state";

export async function loadOpsLearningFromServer(): Promise<{
  ok: boolean;
  source?: "db" | "default";
  error?: string;
}> {
  try {
    const res = await fetch("/api/admin/ops-learning", { cache: "no-store" });
    const j = (await res.json()) as {
      ok?: boolean;
      bundle?: OpsLearningBundleV1;
      source?: "db" | "default";
      error?: string;
    };
    if (!res.ok || !j.ok || !j.bundle) {
      return { ok: false, error: j.error ?? "load_failed" };
    }
    importOpsLearningBundle(j.bundle);
    return { ok: true, source: j.source };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network" };
  }
}

export async function persistOpsLearningToServer(): Promise<{ ok: boolean; error?: string }> {
  try {
    const bundle = exportOpsLearningBundle();
    const res = await fetch("/api/admin/ops-learning", {
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
