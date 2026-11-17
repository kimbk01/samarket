/**
 * 앱 진입 어드민 v3 §5 — 「첫 진입 화면」 마지막 변경 시각·변경한 관리자 (읽기 전용).
 *
 * - 시각: `admin_settings.updated_at` (키 `startup_config_v1` — 저장 함수가 쓰는 열)
 * - 관리자: `admin_settings` 에는 변경자 열이 없다(마이그레이션 20260321120000 · key·value_json·updated_at 뿐).
 *   저장 API(PUT /api/admin/startup-config)가 남기는 `audit_logs` 최신 행(action `startup_config.update`)의 actor_id 를 쓴다.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { STARTUP_CONFIG_SETTINGS_KEY } from "@/lib/startup/startup-config";
import { loadAdminUserLabels } from "@/lib/admin/store-orders/load-admin-store-order-detail";

import type { StartupConfigLastChange } from "@/lib/admin/app-entry/overview-types";

export const STARTUP_CONFIG_AUDIT_ACTION = "startup_config.update";

export async function loadStartupConfigLastChange(sb: SupabaseClient): Promise<StartupConfigLastChange> {
  const [settings, audit] = await Promise.all([
    sb.from("admin_settings").select("updated_at").eq("key", STARTUP_CONFIG_SETTINGS_KEY).maybeSingle(),
    sb
      .from("audit_logs")
      .select("actor_id, created_at")
      .eq("action", STARTUP_CONFIG_AUDIT_ACTION)
      .eq("target_id", STARTUP_CONFIG_SETTINGS_KEY)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  const at = settings.error ? null : ((settings.data as { updated_at?: string | null } | null)?.updated_at ?? null);
  const row = audit.error ? null : (((audit.data ?? []) as { actor_id?: string | null }[])[0] ?? null);
  const actorId = row?.actor_id ? String(row.actor_id) : null;
  let actorLabel: string | null = null;
  if (actorId) {
    try {
      actorLabel = (await loadAdminUserLabels(sb, [actorId])).get(actorId) ?? null;
    } catch {
      actorLabel = null;
    }
  }
  return { at, actorId, actorLabel };
}
