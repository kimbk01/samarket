/** 공용 관리자 처리에 넘기는 게이트 결과 (권한 확인을 마친 관리자 + 서비스 클라이언트) */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminApiActor } from "@/lib/admin/require-admin-permission";

export type SharedAdminHandlerGate = { actor: AdminApiActor; sb: SupabaseClient };
