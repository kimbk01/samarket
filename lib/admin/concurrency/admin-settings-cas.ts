/**
 * admin_settings 단일 설정 행 CAS (서버 전용 — route 에서만 import).
 *
 * `public.admin_settings(key pk, value_json, updated_at timestamptz NULL default now())` 에는
 * updated_at 트리거가 없다 → 쓰기마다 updated_at 을 명시적으로 기록하고, 이전 값 조건부로 UPDATE/DELETE 한다.
 *
 * 버전 토큰(필드별):
 *  - 행 있음 + updated_at 있음 → 그 문자열
 *  - 행 있음 + updated_at NULL(레거시 시드) → "present"
 *  - 행 없음(기본값 사용) → null
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ADMIN_EXPECTED_UPDATED_AT_REQUIRED,
  ADMIN_STALE_UPDATED_AT,
  sameUpdatedAtInstant,
} from "@/lib/admin/concurrency/admin-expected-updated-at";

export const ADMIN_SETTING_ROW_WITHOUT_TIMESTAMP = "present" as const;

export type AdminSettingVersionToken = string | null;

type Sb = Pick<SupabaseClient, "from">;

function isTableMissing(message: string | undefined): boolean {
  const m = message ?? "";
  return m.includes("admin_settings") && m.includes("does not exist");
}

/** key → 버전 토큰 (요청 key 가 모두 포함됨; 없는 행은 null). */
export async function loadAdminSettingVersions(
  sb: Sb,
  keys: readonly string[]
): Promise<{ ok: true; versions: Record<string, AdminSettingVersionToken> } | { ok: false; error: string }> {
  if (keys.length === 0) return { ok: true, versions: {} };
  const { data, error } = await sb.from("admin_settings").select("key, updated_at").in("key", [...keys]);
  if (error) return { ok: false, error: isTableMissing(error.message) ? "table_missing" : error.message };
  return { ok: true, versions: adminSettingVersionsFromRows(keys, (data ?? []) as AdminSettingVersionRow[]) };
}

export type AdminSettingVersionRow = { key?: unknown; updated_at?: unknown };

/** 이미 읽은 행(key, updated_at)으로 key → 버전 토큰 계산 (없는 key 는 null). */
export function adminSettingVersionsFromRows(
  keys: readonly string[],
  rows: readonly AdminSettingVersionRow[]
): Record<string, AdminSettingVersionToken> {
  const versions: Record<string, AdminSettingVersionToken> = {};
  for (const k of keys) versions[k] = null;
  for (const row of rows) {
    const k = typeof row.key === "string" ? row.key : "";
    if (!k || !(k in versions)) continue;
    versions[k] =
      typeof row.updated_at === "string" && row.updated_at.trim()
        ? row.updated_at
        : ADMIN_SETTING_ROW_WITHOUT_TIMESTAMP;
  }
  return versions;
}

/** field → key 매핑으로 응답용 `{ field: token }` 생성. */
export function adminSettingVersionsByField<F extends string>(
  fieldToKey: Record<F, string>,
  keyVersions: Record<string, AdminSettingVersionToken>
): Record<F, AdminSettingVersionToken> {
  const out = {} as Record<F, AdminSettingVersionToken>;
  for (const f of Object.keys(fieldToKey) as F[]) out[f] = keyVersions[fieldToKey[f]] ?? null;
  return out;
}

function sameToken(a: AdminSettingVersionToken, b: AdminSettingVersionToken): boolean {
  if (a === null || b === null) return a === b;
  if (a === ADMIN_SETTING_ROW_WITHOUT_TIMESTAMP || b === ADMIN_SETTING_ROW_WITHOUT_TIMESTAMP) return a === b;
  return sameUpdatedAtInstant(a, b);
}

/**
 * 쓰려는 필드마다 화면이 본 버전(`expected_updated_at[field]`, null = 행 없음)을 요구하고 현재 버전과 비교.
 * 누락 → 400 expected_updated_at_required, 불일치 → 409 stale_updated_at.
 */
export function checkExpectedAdminSettingVersions(
  expected: unknown,
  fields: readonly string[],
  current: Record<string, AdminSettingVersionToken>
): { ok: true } | { ok: false; status: 400 | 409; error: string } {
  if (!expected || typeof expected !== "object" || Array.isArray(expected)) {
    return { ok: false, status: 400, error: ADMIN_EXPECTED_UPDATED_AT_REQUIRED };
  }
  const exp = expected as Record<string, unknown>;
  for (const f of fields) {
    if (!Object.prototype.hasOwnProperty.call(exp, f)) {
      return { ok: false, status: 400, error: ADMIN_EXPECTED_UPDATED_AT_REQUIRED };
    }
    const v = exp[f];
    if (v !== null && typeof v !== "string") {
      return { ok: false, status: 400, error: ADMIN_EXPECTED_UPDATED_AT_REQUIRED };
    }
    const token = typeof v === "string" && v.trim() ? v.trim() : null;
    if (!sameToken(token, current[f] ?? null)) {
      return { ok: false, status: 409, error: ADMIN_STALE_UPDATED_AT };
    }
  }
  return { ok: true };
}

export type AdminSettingCasOp = { kind: "upsert"; valueJson: unknown } | { kind: "delete" };

/**
 * 이전 버전(prev) 조건부 쓰기.
 *  - upsert + prev null → INSERT (동시 INSERT 로 PK 충돌 → stale)
 *  - upsert + prev 있음 → UPDATE ... WHERE key AND updated_at = prev (0행 → stale)
 *  - delete + prev 있음 → DELETE ... WHERE key AND updated_at = prev (0행 → stale)
 *  - delete + prev null → 쓰기 없음(이미 기본값)
 */
export async function casWriteAdminSetting(
  sb: Sb,
  input: { key: string; prev: AdminSettingVersionToken; op: AdminSettingCasOp; nowIso?: string }
): Promise<{ ok: true; updatedAt: string | null } | { ok: false; status: 409 | 500 | 503; error: string }> {
  const now = input.nowIso ?? new Date().toISOString();
  const { key, prev, op } = input;

  const fail = (message: string | undefined) =>
    isTableMissing(message)
      ? ({ ok: false, status: 503, error: "table_missing" } as const)
      : ({ ok: false, status: 500, error: message || "db_error" } as const);
  const stale = { ok: false, status: 409, error: ADMIN_STALE_UPDATED_AT } as const;

  if (op.kind === "delete") {
    if (prev === null) return { ok: true, updatedAt: null };
    const base = sb.from("admin_settings").delete().eq("key", key);
    const q = prev === ADMIN_SETTING_ROW_WITHOUT_TIMESTAMP ? base.is("updated_at", null) : base.eq("updated_at", prev);
    const { data, error } = await q.select("key").maybeSingle();
    if (error) return fail(error.message);
    if (!data) return stale;
    return { ok: true, updatedAt: null };
  }

  if (prev === null) {
    const { data, error } = await sb
      .from("admin_settings")
      .insert({ key, value_json: op.valueJson, updated_at: now })
      .select("key")
      .maybeSingle();
    if (error) {
      if ((error as { code?: string }).code === "23505" || /duplicate key/i.test(error.message ?? "")) return stale;
      return fail(error.message);
    }
    if (!data) return stale;
    return { ok: true, updatedAt: now };
  }

  const base = sb.from("admin_settings").update({ value_json: op.valueJson, updated_at: now }).eq("key", key);
  const q = prev === ADMIN_SETTING_ROW_WITHOUT_TIMESTAMP ? base.is("updated_at", null) : base.eq("updated_at", prev);
  const { data, error } = await q.select("key").maybeSingle();
  if (error) return fail(error.message);
  if (!data) return stale;
  return { ok: true, updatedAt: now };
}
