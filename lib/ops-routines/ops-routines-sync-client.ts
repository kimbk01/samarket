"use client";

import { adminSafeErrorCode } from "@/lib/admin/admin-load-failure";

import type { OpsRoutinesBundleV1 } from "@/lib/ops-routines/ops-routines-state";
import {
  exportOpsRoutinesBundle,
  importOpsRoutinesBundle,
} from "@/lib/ops-routines/ops-routines-state";

export async function loadOpsRoutinesFromServer(): Promise<{
  ok: boolean;
  source?: "db" | "default";
  error?: string;
  httpStatus?: number;
}> {
  try {
    const res = await fetch("/api/admin/ops-routines", { cache: "no-store" });
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      bundle?: OpsRoutinesBundleV1;
      source?: "db" | "default";
      error?: string;
    };
    if (!res.ok || !j.ok || !j.bundle) {
      return { ok: false, error: adminSafeErrorCode(j.error, "load_failed"), httpStatus: res.status };
    }
    importOpsRoutinesBundle(j.bundle);
    return { ok: true, source: j.source };
  } catch {
    return { ok: false, error: "network_error" };
  }
}

export async function persistOpsRoutinesToServer(): Promise<{ ok: boolean; error?: string; httpStatus?: number }> {
  try {
    const bundle = exportOpsRoutinesBundle();
    const res = await fetch("/api/admin/ops-routines", {
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
