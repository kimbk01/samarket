/**
 * DIBAY Messenger — Cutover Runtime Gate 서버 loader/cache (SCAFFOLD).
 *
 * 계약:
 *  - process 메모리 cache TTL 최대 5초, DB 조회 timeout 최대 500ms.
 *  - timeout·DB 오류·row 없음·malformed → fail-closed `LEGACY`.
 *  - Admin PUT 성공 직후 `invalidateCmHomeCutoverGateCache()` 로 즉시 무효화.
 *  - 이 cache 는 room bootstrap/home-sync payload cache 와 **완전히 분리**된다.
 *  - `resolveCmHomeCutoverGateRuntimeMeta` 는 응답 직전에 호출해 최신 resolver 결과를 overlay 한다.
 *    (payload cache 와 함께 저장하지 않는다.)
 *
 * 서버 전용 — 클라이언트에서 import 하지 않는다.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CM_HOME_CUTOVER_GATE_ADMIN_SETTINGS_KEY,
  createLegacyCmHomeCutoverGateConfig,
  normalizeCmHomeCutoverGateConfig,
  type CmHomeCutoverEffectiveGate,
  type CmHomeCutoverGateConfigV1,
} from "@/lib/community-messenger/home/cm-home-cutover-gate-keys";
import { resolveCmHomeCutoverEffectiveGate } from "@/lib/community-messenger/home/cm-home-cutover-gate-resolver";

const GATE_CACHE_TTL_MS = 5_000;
const GATE_DB_TIMEOUT_MS = 500;

type GateCacheEntry = { config: CmHomeCutoverGateConfigV1; expiresAt: number };

/** 단일 row → 단일 캐시 슬롯. */
let gateCache: GateCacheEntry | null = null;

export function invalidateCmHomeCutoverGateCache(): void {
  gateCache = null;
}

function isMissingAdminSettings(err: { message?: string; code?: string }): boolean {
  const m = (err.message ?? "").toLowerCase();
  return err.code === "42P01" || (m.includes("relation") && m.includes("admin_settings"));
}

/** admin_settings.value_json 은 `{ payload, updated_at }` 로 감싼다 (기존 관례). */
function unwrapValueJson(v: unknown): unknown {
  if (v && typeof v === "object" && "payload" in (v as object)) {
    return (v as { payload?: unknown }).payload;
  }
  return v;
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("cm_home_cutover_gate_db_timeout")), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * DB raw config 조회 (admin API·loader 공용). row 없음·malformed → LEGACY 정규화.
 * DB 오류/timeout 은 throw 하지 않고 `{ ok:false }` 로 알린다(호출측 fail-closed).
 */
export async function loadRawCmHomeCutoverGateConfig(
  sb: SupabaseClient
): Promise<
  | { ok: true; config: CmHomeCutoverGateConfigV1; source: "db" | "default"; raw: unknown }
  | { ok: false; reason: "missing_table" | "error"; message?: string }
> {
  const { data, error } = await sb
    .from("admin_settings")
    .select("value_json")
    .eq("key", CM_HOME_CUTOVER_GATE_ADMIN_SETTINGS_KEY)
    .maybeSingle();

  if (error) {
    if (isMissingAdminSettings(error)) return { ok: false, reason: "missing_table", message: error.message };
    return { ok: false, reason: "error", message: error.message };
  }

  const raw = unwrapValueJson((data as { value_json?: unknown } | null)?.value_json);
  if (raw == null) {
    return { ok: true, config: createLegacyCmHomeCutoverGateConfig(), source: "default", raw: null };
  }
  return { ok: true, config: normalizeCmHomeCutoverGateConfig(raw), source: "db", raw };
}

export async function saveCmHomeCutoverGateConfig(
  sb: SupabaseClient,
  config: CmHomeCutoverGateConfigV1
): Promise<{ ok: true } | { ok: false; error: string }> {
  const value_json = { payload: config, updated_at: new Date().toISOString() };
  const { error } = await sb
    .from("admin_settings")
    .upsert({ key: CM_HOME_CUTOVER_GATE_ADMIN_SETTINGS_KEY, value_json, updated_at: new Date().toISOString() }, {
      onConflict: "key",
    });
  if (error) {
    if (isMissingAdminSettings(error)) return { ok: false, error: "admin_settings 테이블이 없습니다." };
    return { ok: false, error: error.message };
  }
  invalidateCmHomeCutoverGateCache();
  return { ok: true };
}

/**
 * loader — process cache(≤5s) + DB timeout(≤500ms). 실패 시 LEGACY.
 * Kill 값을 읽은 config 를 stale-while-revalidate 로 canonical 로 되돌리지 않는다
 * (만료 후에는 반드시 재조회, 실패 시 LEGACY).
 */
export async function loadCmHomeCutoverGateConfig(): Promise<CmHomeCutoverGateConfigV1> {
  const now = Date.now();
  if (gateCache && gateCache.expiresAt > now) return gateCache.config;

  let config = createLegacyCmHomeCutoverGateConfig();
  try {
    const { tryCreateSupabaseServiceClient } = await import("@/lib/supabase/try-supabase-server");
    const sb = tryCreateSupabaseServiceClient();
    if (sb) {
      const loaded = await withTimeout(loadRawCmHomeCutoverGateConfig(sb), GATE_DB_TIMEOUT_MS);
      if (loaded.ok) config = loaded.config;
      // loaded.ok === false(missing_table/error) → LEGACY 유지 (fail-closed)
    }
  } catch {
    // timeout·예외 → LEGACY 유지 (fail-closed)
    config = createLegacyCmHomeCutoverGateConfig();
  }

  gateCache = { config, expiresAt: now + GATE_CACHE_TTL_MS };
  return config;
}

/**
 * 응답 envelope 로 내려보낼 사용자별 effective gate. 항상 성공(실패 → LEGACY effective).
 */
export async function resolveCmHomeCutoverGateRuntimeMeta(
  userId: string | null | undefined
): Promise<CmHomeCutoverEffectiveGate> {
  const config = await loadCmHomeCutoverGateConfig();
  return resolveCmHomeCutoverEffectiveGate(config, userId);
}
