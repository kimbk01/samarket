"use client";

import type { OpsKnowledgeGraphBundleV1 } from "@/lib/ops-knowledge-graph/ops-knowledge-graph-state";
import {
  exportOpsKnowledgeGraphBundle,
  importOpsKnowledgeGraphBundle,
  rebuildOpsKnowledgeGraph,
} from "@/lib/ops-knowledge-graph/ops-knowledge-graph-state";

export async function loadOpsKnowledgeGraphFromServer(): Promise<{
  ok: boolean;
  source?: "db" | "default";
  error?: string;
}> {
  try {
    const res = await fetch("/api/admin/ops-knowledge-graph", { cache: "no-store" });
    const j = (await res.json()) as {
      ok?: boolean;
      bundle?: OpsKnowledgeGraphBundleV1;
      source?: "db" | "default";
      error?: string;
    };
    if (!res.ok || !j.ok || !j.bundle) {
      return { ok: false, error: j.error ?? "load_failed" };
    }
    importOpsKnowledgeGraphBundle(j.bundle);
    if (!j.bundle.nodes?.length) {
      rebuildOpsKnowledgeGraph();
    }
    return { ok: true, source: j.source };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network" };
  }
}

export async function persistOpsKnowledgeGraphToServer(): Promise<{
  ok: boolean;
  error?: string;
}> {
  try {
    const bundle = exportOpsKnowledgeGraphBundle();
    const res = await fetch("/api/admin/ops-knowledge-graph", {
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

/** 지식 그래프 — docs·runbooks·그래프 번들 동시 로드 */
export async function loadOpsKnowledgeGraphWorkspaceFromServer(): Promise<{
  ok: boolean;
  errors?: string[];
}> {
  const { loadOpsDocsFromServer } = await import("@/lib/ops-docs/ops-docs-sync-client");
  const { loadOpsRunbooksFromServer } = await import(
    "@/lib/ops-runbooks/ops-runbooks-sync-client"
  );
  const [docs, runbooks, graph] = await Promise.all([
    loadOpsDocsFromServer(),
    loadOpsRunbooksFromServer(),
    loadOpsKnowledgeGraphFromServer(),
  ]);
  const errors: string[] = [];
  if (!docs.ok) errors.push(docs.error ?? "docs_load_failed");
  if (!runbooks.ok) errors.push(runbooks.error ?? "runbooks_load_failed");
  if (!graph.ok) errors.push(graph.error ?? "graph_load_failed");
  rebuildOpsKnowledgeGraph();
  return { ok: docs.ok && runbooks.ok && graph.ok, errors: errors.length ? errors : undefined };
}
