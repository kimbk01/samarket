"use client";

import type { OpsKnowledgeBundleV1 } from "@/lib/ops-knowledge/ops-knowledge-state";
import {
  exportOpsKnowledgeBundle,
  importOpsKnowledgeBundle,
} from "@/lib/ops-knowledge/ops-knowledge-state";

export async function loadOpsKnowledgeFromServer(): Promise<{
  ok: boolean;
  source?: "db" | "default";
  error?: string;
}> {
  try {
    const res = await fetch("/api/admin/ops-knowledge", { cache: "no-store" });
    const j = (await res.json()) as {
      ok?: boolean;
      bundle?: OpsKnowledgeBundleV1;
      source?: "db" | "default";
      error?: string;
    };
    if (!res.ok || !j.ok || !j.bundle) {
      return { ok: false, error: j.error ?? "load_failed" };
    }
    importOpsKnowledgeBundle(j.bundle);
    return { ok: true, source: j.source };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network" };
  }
}

export async function persistOpsKnowledgeToServer(): Promise<{ ok: boolean; error?: string }> {
  try {
    const bundle = exportOpsKnowledgeBundle();
    const res = await fetch("/api/admin/ops-knowledge", {
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
