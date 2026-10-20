"use client";

import { adminSafeErrorCode } from "@/lib/admin/admin-load-failure";

import type { OpsKnowledgeBundleV1 } from "@/lib/ops-knowledge/ops-knowledge-state";
import {
  exportOpsKnowledgeBundle,
  importOpsKnowledgeBundle,
} from "@/lib/ops-knowledge/ops-knowledge-state";

export async function loadOpsKnowledgeFromServer(): Promise<{
  ok: boolean;
  source?: "db" | "default";
  error?: string;
  httpStatus?: number;
}> {
  try {
    const res = await fetch("/api/admin/ops-knowledge", { cache: "no-store" });
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      bundle?: OpsKnowledgeBundleV1;
      source?: "db" | "default";
      error?: string;
    };
    if (!res.ok || !j.ok || !j.bundle) {
      return { ok: false, error: adminSafeErrorCode(j.error, "load_failed"), httpStatus: res.status };
    }
    importOpsKnowledgeBundle(j.bundle);
    return { ok: true, source: j.source };
  } catch {
    return { ok: false, error: "network_error" };
  }
}

export async function persistOpsKnowledgeToServer(): Promise<{ ok: boolean; error?: string; httpStatus?: number }> {
  try {
    const bundle = exportOpsKnowledgeBundle();
    const res = await fetch("/api/admin/ops-knowledge", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bundle }),
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !j.ok) {
      return { ok: false, error: adminSafeErrorCode(j.error, "save_failed"), httpStatus: res.status };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "network_error" };
  }
}

/**
 * 변경 1건 = 스냅샷 → 변경 → 서버 저장. 저장 실패면 화면 상태를 스냅샷으로 되돌린다 (R6 — 실패 무시 금지).
 */
export async function commitOpsKnowledgeChange(
  mutate: () => void
): Promise<{ ok: boolean; error?: string; httpStatus?: number }> {
  const before = exportOpsKnowledgeBundle();
  mutate();
  const r = await persistOpsKnowledgeToServer();
  if (!r.ok) importOpsKnowledgeBundle(before);
  return r;
}
