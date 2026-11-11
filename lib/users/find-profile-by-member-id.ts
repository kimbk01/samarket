import type { SupabaseClient } from "@supabase/supabase-js";
import { escapeIlikePatternFragment } from "@/lib/community-messenger/profile-user-search-filter";

/**
 * 공개 프로필 주소(`/u/[아이디]`)·공개 프로필 API 공용 회원 찾기 (설계안 v3 D8 · 재감사 N5).
 * 회원 아이디(`dibay_id`)로 먼저 찾고, 예전 username 링크는 그다음. 바뀐 회원의 기본 아이디로는 찾지 않는다.
 * select 가 옛 스키마에서 실패하면 `fallbackSelect` 로 한 번 더.
 */
export async function findProfileByMemberId<T = Record<string, unknown>>(
  sb: SupabaseClient<any>,
  rawId: string,
  select: string,
  fallbackSelect?: string,
): Promise<{ row: T | null; error: { message?: string } | null }> {
  const id = String(rawId ?? "").trim().toLowerCase().replace(/^@+/, "");
  if (!id) return { row: null, error: null };
  const pattern = escapeIlikePatternFragment(id);
  let lastError: { message?: string } | null = null;
  for (const column of ["dibay_id", "username"] as const) {
    const r = await sb.from("profiles").select(select).ilike(column, pattern).maybeSingle();
    let data = r.data as T | null;
    let error = r.error as { message?: string } | null;
    if (error && fallbackSelect && /column|does not exist|schema cache|Could not find/i.test(String(error.message ?? ""))) {
      const r2 = await sb.from("profiles").select(fallbackSelect).ilike(column, pattern).maybeSingle();
      data = r2.data as T | null;
      error = r2.error as { message?: string } | null;
    }
    if (data) return { row: data, error: null };
    lastError = error;
  }
  return { row: null, error: lastError };
}
