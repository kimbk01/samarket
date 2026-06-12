"use client";

import type { AutomationBundleV1 } from "@/lib/automation/automation-state";
import {
  exportAutomationBundle,
  importAutomationBundle,
} from "@/lib/automation/automation-state";

export async function loadAutomationFromServer(): Promise<{
  ok: boolean;
  source?: "db" | "default";
  error?: string;
}> {
  try {
    const res = await fetch("/api/admin/automation", { cache: "no-store" });
    const j = (await res.json()) as {
      ok?: boolean;
      bundle?: AutomationBundleV1;
      source?: "db" | "default";
      error?: string;
    };
    if (!res.ok || !j.ok || !j.bundle) {
      return { ok: false, error: j.error ?? "load_failed" };
    }
    importAutomationBundle(j.bundle);
    return { ok: true, source: j.source };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network" };
  }
}

export async function persistAutomationToServer(): Promise<{ ok: boolean; error?: string }> {
  try {
    const bundle = exportAutomationBundle();
    const res = await fetch("/api/admin/automation", {
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
