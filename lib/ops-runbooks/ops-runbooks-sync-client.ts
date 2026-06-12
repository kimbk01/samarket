"use client";

import type { OpsRunbooksBundleV1 } from "@/lib/ops-runbooks/ops-runbooks-state";
import {
  exportOpsRunbooksBundle,
  importOpsRunbooksBundle,
} from "@/lib/ops-runbooks/ops-runbooks-state";

export async function loadOpsRunbooksFromServer(): Promise<{
  ok: boolean;
  source?: "db" | "default";
  error?: string;
}> {
  try {
    const res = await fetch("/api/admin/ops-runbooks", { cache: "no-store" });
    const j = (await res.json()) as {
      ok?: boolean;
      bundle?: OpsRunbooksBundleV1;
      source?: "db" | "default";
      error?: string;
    };
    if (!res.ok || !j.ok || !j.bundle) {
      return { ok: false, error: j.error ?? "load_failed" };
    }
    importOpsRunbooksBundle(j.bundle);
    return { ok: true, source: j.source };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network" };
  }
}

export async function persistOpsRunbooksToServer(): Promise<{ ok: boolean; error?: string }> {
  try {
    const bundle = exportOpsRunbooksBundle();
    const res = await fetch("/api/admin/ops-runbooks", {
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

/** 런북 실행 UI — 문서 + 런북 번들 동시 로드 */
export async function loadOpsRunbookWorkspaceFromServer(): Promise<{
  ok: boolean;
  errors?: string[];
}> {
  const { loadOpsDocsFromServer } = await import("@/lib/ops-docs/ops-docs-sync-client");
  const [docs, runbooks] = await Promise.all([
    loadOpsDocsFromServer(),
    loadOpsRunbooksFromServer(),
  ]);
  const errors: string[] = [];
  if (!docs.ok) errors.push(docs.error ?? "docs_load_failed");
  if (!runbooks.ok) errors.push(runbooks.error ?? "runbooks_load_failed");
  return { ok: docs.ok && runbooks.ok, errors: errors.length ? errors : undefined };
}
