/**
 * 고객센터 문의 유형 어드민 설정 — DB 읽기/쓰기 (서버 전용, service role).
 * 표가 아직 없으면(운영 미적용) 읽기 = 빈 목록(코드 기본값 그대로), 쓰기 = missing_table.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SupportCategorySettingRow } from "@/lib/support/support-category-settings";

const COLUMNS = "audience, category_id, issue_id, label_ko, label_en, sort_order, hidden, updated_at";

function isMissingTable(message: string, code?: string): boolean {
  return code === "42P01" || code === "PGRST205" || /support_category_settings/.test(message) && /does not exist|not find|schema cache/i.test(message);
}

export async function listSupportCategorySettings(
  sb: SupabaseClient
): Promise<{ ok: true; rows: SupportCategorySettingRow[]; tableMissing: boolean } | { ok: false; error: string }> {
  const { data, error } = await sb.from("support_category_settings").select(COLUMNS).limit(2000);
  if (error) {
    if (isMissingTable(error.message ?? "", (error as { code?: string }).code)) {
      return { ok: true, rows: [], tableMissing: true };
    }
    return { ok: false, error: "settings_fetch_failed" };
  }
  return { ok: true, rows: (data ?? []) as SupportCategorySettingRow[], tableMissing: false };
}

export async function upsertSupportCategorySetting(
  sb: SupabaseClient,
  input: { row: SupportCategorySettingRow; adminUserId: string }
): Promise<{ ok: true; row: SupportCategorySettingRow; before: SupportCategorySettingRow | null } | { ok: false; error: string }> {
  const { row } = input;
  const prev = await sb
    .from("support_category_settings")
    .select(COLUMNS)
    .eq("audience", row.audience)
    .eq("category_id", row.category_id)
    .eq("issue_id", row.issue_id)
    .maybeSingle();
  if (prev.error) {
    if (isMissingTable(prev.error.message ?? "", (prev.error as { code?: string }).code)) {
      return { ok: false, error: "missing_table" };
    }
    return { ok: false, error: "settings_fetch_failed" };
  }
  const { data, error } = await sb
    .from("support_category_settings")
    .upsert(
      {
        audience: row.audience,
        category_id: row.category_id,
        issue_id: row.issue_id,
        label_ko: row.label_ko,
        label_en: row.label_en,
        sort_order: row.sort_order,
        hidden: row.hidden,
        updated_by: input.adminUserId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "audience,category_id,issue_id" }
    )
    .select(COLUMNS)
    .single();
  if (error || !data) {
    if (error && isMissingTable(error.message ?? "", (error as { code?: string }).code)) {
      return { ok: false, error: "missing_table" };
    }
    return { ok: false, error: "settings_save_failed" };
  }
  return { ok: true, row: data as SupportCategorySettingRow, before: (prev.data as SupportCategorySettingRow | null) ?? null };
}
