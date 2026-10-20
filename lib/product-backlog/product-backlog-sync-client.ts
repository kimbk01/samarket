"use client";

import { adminSafeErrorCode } from "@/lib/admin/admin-load-failure";

import type { ProductBacklogBundleV1 } from "@/lib/product-backlog/product-backlog-state";
import {
  exportProductBacklogBundle,
  importProductBacklogBundle,
} from "@/lib/product-backlog/product-backlog-state";

export async function loadProductBacklogFromServer(): Promise<{
  ok: boolean;
  source?: "db" | "default";
  error?: string;
  httpStatus?: number;
}> {
  try {
    const res = await fetch("/api/admin/product-backlog", { cache: "no-store" });
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      bundle?: ProductBacklogBundleV1;
      source?: "db" | "default";
      error?: string;
    };
    if (!res.ok || !j.ok || !j.bundle) {
      return { ok: false, error: adminSafeErrorCode(j.error, "load_failed"), httpStatus: res.status };
    }
    importProductBacklogBundle(j.bundle);
    return { ok: true, source: j.source };
  } catch {
    return { ok: false, error: "network_error" };
  }
}

export async function persistProductBacklogToServer(): Promise<{ ok: boolean; error?: string; httpStatus?: number }> {
  try {
    const bundle = exportProductBacklogBundle();
    const res = await fetch("/api/admin/product-backlog", {
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
