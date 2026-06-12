"use client";

import type { QaBoardBundleV1 } from "@/lib/qa-board/qa-board-state";
import {
  exportQaBoardBundle,
  importQaBoardBundle,
} from "@/lib/qa-board/qa-board-state";

export async function loadQaBoardFromServer(): Promise<{
  ok: boolean;
  source?: "db" | "default";
  error?: string;
}> {
  try {
    const res = await fetch("/api/admin/qa-board", { cache: "no-store" });
    const j = (await res.json()) as {
      ok?: boolean;
      bundle?: QaBoardBundleV1;
      source?: "db" | "default";
      error?: string;
    };
    if (!res.ok || !j.ok || !j.bundle) {
      return { ok: false, error: j.error ?? "load_failed" };
    }
    importQaBoardBundle(j.bundle);
    return { ok: true, source: j.source };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network" };
  }
}

export async function persistQaBoardToServer(): Promise<{ ok: boolean; error?: string }> {
  try {
    const bundle = exportQaBoardBundle();
    const res = await fetch("/api/admin/qa-board", {
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
