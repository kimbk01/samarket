"use client";

import type { ReleaseArchiveBundleV1 } from "@/lib/release-archive/release-archive-state";
import {
  exportReleaseArchiveBundle,
  importReleaseArchiveBundle,
} from "@/lib/release-archive/release-archive-state";

export async function loadReleaseArchiveFromServer(): Promise<{
  ok: boolean;
  source?: "db" | "default";
  error?: string;
}> {
  try {
    const res = await fetch("/api/admin/release-archive", { cache: "no-store" });
    const j = (await res.json()) as {
      ok?: boolean;
      bundle?: ReleaseArchiveBundleV1;
      source?: "db" | "default";
      error?: string;
    };
    if (!res.ok || !j.ok || !j.bundle) {
      return { ok: false, error: j.error ?? "load_failed" };
    }
    importReleaseArchiveBundle(j.bundle);
    return { ok: true, source: j.source };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network" };
  }
}

export async function persistReleaseArchiveToServer(): Promise<{
  ok: boolean;
  error?: string;
}> {
  try {
    const bundle = exportReleaseArchiveBundle();
    const res = await fetch("/api/admin/release-archive", {
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
