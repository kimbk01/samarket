/**
 * 광고 쓰기 서버 가드 (설계 `ads-admin-ssot-design-2026-11-07.md` §4 · 2026-11-07) — 클라이언트에서 import 금지.
 * 거래·커뮤니티 상위노출 쓰기(도메인 API · 공통 광고 화면) = **ads 키 하나**. 예전 「거래 관리자(O-2 전원)」·
 * 「커뮤니티 promotion」 대신 이 함수를 쓴다. 정지된 운영자는 `requireAdminApiActor` 가 이미 막는다(최고관리자 제외).
 * 화면 쪽 같은 키 = `ADS_BOOST_WRITE_REQUIREMENT` (`admin-ads-authority.ts`).
 */
import "server-only";
import type { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdminPermission, type AdminApiActor } from "@/lib/admin/require-admin-permission";

export type AdsWriteAdminGate =
  | { ok: true; userId: string; actor: AdminApiActor; sb: SupabaseClient }
  | { ok: false; response: NextResponse };

export async function requireAdsWriteAdmin(): Promise<AdsWriteAdminGate> {
  const base = await requireAdminPermission("ads");
  if (!base.ok) return base;
  return { ...base, userId: base.actor.userId };
}
