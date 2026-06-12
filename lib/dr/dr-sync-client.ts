"use client";

import type { DrOpsBundleV1 } from "@/lib/dr/dr-state";
import { exportDrOpsBundle, importDrOpsBundle } from "@/lib/dr/dr-state";

/** 관리자 DR 페이지 — 서버 번들로 클라이언트 상태 초기화 */
export async function loadDrOpsFromServer(): Promise<{
  ok: boolean;
  source?: "db" | "default";
  error?: string;
}> {
  try {
    const res = await fetch("/api/admin/dr", { cache: "no-store" });
    const j = (await res.json()) as {
      ok?: boolean;
      bundle?: DrOpsBundleV1;
      source?: "db" | "default";
      error?: string;
    };
    if (!res.ok || !j.ok || !j.bundle) {
      return { ok: false, error: j.error ?? "load_failed" };
    }
    importDrOpsBundle(j.bundle);
    return { ok: true, source: j.source };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network" };
  }
}

export async function persistDrOpsToServer(): Promise<{ ok: boolean; error?: string }> {
  try {
    const bundle = exportDrOpsBundle();
    const res = await fetch("/api/admin/dr", {
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
