"use client";

import type { FeedEmergencyBundleV1 } from "@/lib/feed-emergency/feed-emergency-state";
import { exportFeedEmergencyBundle, importFeedEmergencyBundle } from "@/lib/feed-emergency/feed-emergency-state";

/** 관리자 피드 장애 페이지 — 서버 번들로 클라이언트 상태 초기화 */
export async function loadFeedEmergencyFromServer(): Promise<{
  ok: boolean;
  source?: "db" | "default";
  error?: string;
}> {
  try {
    const res = await fetch("/api/admin/feed-emergency", { cache: "no-store" });
    const j = (await res.json()) as {
      ok?: boolean;
      bundle?: FeedEmergencyBundleV1;
      source?: "db" | "default";
      error?: string;
    };
    if (!res.ok || !j.ok || !j.bundle) {
      return { ok: false, error: j.error ?? "load_failed" };
    }
    importFeedEmergencyBundle(j.bundle);
    return { ok: true, source: j.source };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network" };
  }
}

export async function persistFeedEmergencyToServer(): Promise<{ ok: boolean; error?: string }> {
  try {
    const bundle = exportFeedEmergencyBundle();
    const res = await fetch("/api/admin/feed-emergency", {
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

/**
 * 변경 1건 = 스냅샷 → 변경 → 서버 저장. 저장 실패면 화면 상태를 스냅샷으로 되돌린다
 * (예전: 실패해도 화면에는 바뀐 값이 남아 실제 앱과 달라 보이던 결함).
 */
export async function commitFeedEmergencyChange(mutate: () => void): Promise<{ ok: boolean; error?: string }> {
  const before = exportFeedEmergencyBundle();
  mutate();
  const r = await persistFeedEmergencyToServer();
  if (!r.ok) importFeedEmergencyBundle(before);
  return r;
}
