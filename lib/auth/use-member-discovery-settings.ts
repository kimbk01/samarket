"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * 친구 찾기 설정 (설계안 v3 §3.7) 클라이언트 캐시 — 아이디 안내 문구(단일 계약)가 「아이디로 나를 찾기」를 반영하도록 (재감사 E4).
 * 한 세션에 1회 `GET /api/me/discovery-settings`, 설정 화면이 저장하면 `setMemberDiscoverySettingsCache` 로 갱신.
 */
export type MemberDiscoverySettings = { allowIdSearch: boolean; allowQrAdd: boolean };

let cache: MemberDiscoverySettings | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function setMemberDiscoverySettingsCache(next: MemberDiscoverySettings): void {
  cache = next;
  emit();
}

async function load(): Promise<void> {
  try {
    const r = await fetch("/api/me/discovery-settings", { credentials: "include" });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; settings?: MemberDiscoverySettings };
    if (r.ok && j.ok === true && j.settings) setMemberDiscoverySettingsCache(j.settings);
  } catch {
    /* 못 읽으면 안내는 기본(켜짐) 기준 */
  } finally {
    inflight = null;
  }
}

/** 아직 모르면 null — 안내는 켜짐 기준으로 보인다 */
export function useMemberDiscoverySettings(): MemberDiscoverySettings | null {
  const value = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => cache,
    () => null,
  );
  useEffect(() => {
    if (cache || inflight) return;
    inflight = load();
  }, []);
  return value;
}
