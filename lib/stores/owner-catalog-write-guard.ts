/**
 * 3-E PRD-15 — 오너 상품·메뉴 카테고리·이미지 업로드 쓰기 가드 통일.
 *
 * 순서: 세션(`validateActiveSession` — 탈퇴·정지 회원·만료 세션 차단) → (상품 등록만) 전화 인증 → 매장 소유 →
 * 1-B 게이트(`ownerStoreOperationalWriteBlock` 승인 매장만 / 업로드는 `ownerStoreProfileWriteBlock` 온보딩 허용).
 * 게이트 함수는 `owner-product-gate.ts` 정의를 그대로 쓴다 (재정의 금지).
 * 전화 인증은 기존 상품 등록(POST)에만 유지 — 운영 승인 매장 오너 17명 중 4명이 미인증(2026-10-21 읽기 확인)이라
 * 수정·카테고리·업로드에 새로 걸면 기존 운영 매장 편집이 막힌다.
 */
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requirePhoneVerified, validateActiveSession } from "@/lib/auth/server-guards";
import {
  getStoreIfOwner,
  ownerStoreOperationalWriteBlock,
  ownerStoreProfileWriteBlock,
  type StoreGateRow,
} from "@/lib/stores/owner-product-gate";

export type OwnerCatalogWriteGuardResult =
  | { ok: true; store: StoreGateRow }
  | { ok: false; response: NextResponse };

export async function guardOwnerCatalogWrite(
  sb: SupabaseClient<any>,
  userId: string,
  storeId: string,
  opts?: { scope?: "operational" | "profile"; requirePhone?: boolean }
): Promise<OwnerCatalogWriteGuardResult> {
  const session = await validateActiveSession(userId);
  if (!session.ok) return { ok: false, response: session.response };
  if (opts?.requirePhone) {
    const phone = await requirePhoneVerified(userId);
    if (!phone.ok) return { ok: false, response: phone.response };
  }

  const gate = await getStoreIfOwner(sb, userId, storeId);
  if (!gate.ok) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: gate.error }, { status: gate.status }),
    };
  }
  const block =
    opts?.scope === "profile"
      ? ownerStoreProfileWriteBlock(gate.store.approval_status)
      : ownerStoreOperationalWriteBlock(gate.store.approval_status);
  if (block) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: block.error }, { status: block.status }),
    };
  }
  return { ok: true, store: gate.store };
}

/** PRD-15 — 500 응답은 DB 원문을 내보내지 않는다 (서버 로그만). */
export function ownerCatalogDbErrorResponse(tag: string, err: unknown): NextResponse {
  console.error(tag, err);
  return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });
}
