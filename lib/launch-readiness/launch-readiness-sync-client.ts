"use client";

import { adminSafeErrorCode } from "@/lib/admin/admin-load-failure";

import type { LaunchReadinessBundleV1 } from "@/lib/launch-readiness/launch-readiness-state";
import {
  exportLaunchReadinessBundle,
  importLaunchReadinessBundle,
} from "@/lib/launch-readiness/launch-readiness-state";

export async function loadLaunchReadinessFromServer(): Promise<{
  ok: boolean;
  source?: "db" | "default";
  error?: string;
  httpStatus?: number;
}> {
  try {
    const res = await fetch("/api/admin/launch-readiness", { cache: "no-store" });
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      bundle?: LaunchReadinessBundleV1;
      source?: "db" | "default";
      error?: string;
    };
    if (!res.ok || !j.ok || !j.bundle) {
      return { ok: false, error: adminSafeErrorCode(j.error, "load_failed"), httpStatus: res.status };
    }
    importLaunchReadinessBundle(j.bundle);
    return { ok: true, source: j.source };
  } catch {
    return { ok: false, error: "network_error" };
  }
}

export async function persistLaunchReadinessToServer(): Promise<{
  ok: boolean;
  error?: string;
  httpStatus?: number;
}> {
  try {
    const bundle = exportLaunchReadinessBundle();
    const res = await fetch("/api/admin/launch-readiness", {
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
