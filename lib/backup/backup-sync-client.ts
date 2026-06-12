"use client";

import type { BackupBundleV1 } from "@/lib/backup/backup-state";
import { exportBackupBundle, importBackupBundle } from "@/lib/backup/backup-state";

/** 관리자 백업 페이지 — 서버 번들로 클라이언트 상태 초기화 */
export async function loadBackupFromServer(): Promise<{
  ok: boolean;
  source?: "db" | "default";
  error?: string;
}> {
  try {
    const res = await fetch("/api/admin/backup", { cache: "no-store" });
    const j = (await res.json()) as {
      ok?: boolean;
      bundle?: BackupBundleV1;
      source?: "db" | "default";
      error?: string;
    };
    if (!res.ok || !j.ok || !j.bundle) {
      return { ok: false, error: j.error ?? "load_failed" };
    }
    importBackupBundle(j.bundle);
    return { ok: true, source: j.source };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network" };
  }
}

export async function persistBackupToServer(): Promise<{ ok: boolean; error?: string }> {
  try {
    const bundle = exportBackupBundle();
    const res = await fetch("/api/admin/backup", {
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
