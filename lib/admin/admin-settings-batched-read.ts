import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 관리자 설정(`admin_settings`) 읽기 묶음 — 같은 순간(같은 마이크로태스크)에 들어온 키 읽기를 **조회 1번**으로 합친다.
 *
 * 2026-11-19 운영 실측: `/api/stores/home-feed` 1요청당 admin_settings 2.7회
 * (배달 시간 기준·배달 거리 정책·커머스 설정을 각자 따로 읽음). 레거시 서버의 데이터 로더처럼 묶어 1회로.
 * 오류는 원래 결과(`error`)를 그대로 각 호출자에게 돌려준다 — 호출자의 기존 오류 처리(없는 표·실패 시 기본값·fail-closed)는 그대로.
 * 캐시는 하지 않는다(각 호출자의 기존 TTL 그대로) — 관리자 저장 반영 시점은 바뀌지 않는다.
 */

export type AdminSettingRow = { key: string; value_json: unknown };
export type AdminSettingsBatchResult = {
  rows: AdminSettingRow[];
  error: { message?: string } | null;
};

type Waiter = { keys: string[]; resolve: (r: AdminSettingsBatchResult) => void };
type Pending = { keys: Set<string>; waiters: Waiter[] };

const pendingByClient = new WeakMap<object, Pending>();

async function flush(sb: SupabaseClient, pending: Pending): Promise<void> {
  let result: AdminSettingsBatchResult;
  try {
    const { data, error } = await sb.from("admin_settings").select("key, value_json").in("key", [...pending.keys]);
    result = { rows: ((data ?? []) as AdminSettingRow[]).filter((r) => typeof r?.key === "string"), error: error ?? null };
  } catch (e) {
    result = { rows: [], error: { message: e instanceof Error ? e.message : String(e) } };
  }
  for (const w of pending.waiters) {
    const want = new Set(w.keys);
    w.resolve({ rows: result.rows.filter((r) => want.has(r.key)), error: result.error });
  }
}

export function readAdminSettingsBatched(sb: SupabaseClient, keys: readonly string[]): Promise<AdminSettingsBatchResult> {
  const list = [...new Set(keys.map((k) => String(k ?? "").trim()).filter(Boolean))];
  if (!list.length) return Promise.resolve({ rows: [], error: null });
  return new Promise<AdminSettingsBatchResult>((resolve) => {
    let pending = pendingByClient.get(sb as object);
    if (!pending) {
      pending = { keys: new Set(), waiters: [] };
      pendingByClient.set(sb as object, pending);
      const p = pending;
      queueMicrotask(() => {
        pendingByClient.delete(sb as object);
        void flush(sb, p);
      });
    }
    for (const k of list) pending.keys.add(k);
    pending.waiters.push({ keys: list, resolve });
  });
}
