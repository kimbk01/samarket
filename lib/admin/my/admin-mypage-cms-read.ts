import type { SupabaseClient } from "@supabase/supabase-js";
import type { MyPageSectionRow, MyServiceRow } from "@/lib/my/types";
import { MY_PAGE_SECTIONS_SELECT, MY_SERVICES_SELECT } from "@/lib/my/mypage-tables-select";

/** V3-11 — 관리자 마이페이지 섹션 목록 (서버 조회 전용). */
export async function listAdminMyPageSections(sb: SupabaseClient): Promise<MyPageSectionRow[]> {
  const { data, error } = await sb
    .from("my_page_sections")
    .select(MY_PAGE_SECTIONS_SELECT)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as MyPageSectionRow[];
}

/** V3-11 — 관리자 마이페이지 서비스 목록 (서버 조회 전용). */
export async function listAdminMyServices(sb: SupabaseClient): Promise<MyServiceRow[]> {
  const { data, error } = await sb
    .from("my_services")
    .select(MY_SERVICES_SELECT)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as MyServiceRow[];
}
