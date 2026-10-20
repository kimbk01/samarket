import type { SupabaseClient } from "@supabase/supabase-js";

type AnySb = SupabaseClient<any>;

export type StoreGateRow = {
  id: string;
  owner_user_id: string;
  approval_status: string;
  owner_can_edit_store_identity: boolean;
};

export async function getStoreIfOwner(
  sb: AnySb,
  userId: string,
  storeId: string
): Promise<{ ok: true; store: StoreGateRow } | { ok: false; status: number; error: string }> {
  const { data: store, error } = await sb
    .from("stores")
    .select("id, owner_user_id, approval_status, owner_can_edit_store_identity")
    .eq("id", storeId)
    .maybeSingle();

  if (error || !store) {
    return { ok: false, status: 404, error: "store_not_found" };
  }
  if (store.owner_user_id !== userId) {
    return { ok: false, status: 403, error: "forbidden" };
  }
  return {
    ok: true,
    store: {
      id: store.id as string,
      owner_user_id: store.owner_user_id as string,
      approval_status: store.approval_status as string,
      owner_can_edit_store_identity: store.owner_can_edit_store_identity === true,
    },
  };
}

export async function canOwnerSellProducts(
  sb: AnySb,
  storeId: string
): Promise<boolean> {
  const { data: perm } = await sb
    .from("store_sales_permissions")
    .select("allowed_to_sell, sales_status")
    .eq("store_id", storeId)
    .maybeSingle();

  return !!(perm && perm.allowed_to_sell === true && perm.sales_status === "approved");
}

export type OwnerOperationalWriteBlock = {
  ok: false;
  status: 403;
  error: "store_suspended" | "store_not_approved";
};

/**
 * 1-B (IA-03) — 오너 운영 쓰기(광고·쿠폰·배너·공지·상품권·고객 응대·캐시·Coin)는 승인 매장만.
 * 정지 매장은 진행 주문·주문 채팅만 처리한다 (DEF-71 — `StoreBusinessGuard` 화면 규칙과 같은 서버 규칙).
 * 주문 처리 라우트는 이 게이트를 쓰지 않는다. 매장 정보·영업·배달 지역 편집은 `ownerStoreProfileWriteBlock`.
 */
export function ownerStoreOperationalWriteBlock(
  approvalStatus: string | null | undefined
): OwnerOperationalWriteBlock | null {
  const st = String(approvalStatus ?? "").trim();
  if (st === "approved") return null;
  return { ok: false, status: 403, error: st === "suspended" ? "store_suspended" : "store_not_approved" };
}

/** 매장 정보·배달 지역 편집 — 승인·심사 중(온보딩) 허용, 반려·정지 차단 (`PATCH /api/me/stores/[id]` 와 동일). */
export function ownerStoreProfileWriteBlock(
  approvalStatus: string | null | undefined
): OwnerOperationalWriteBlock | null {
  const st = String(approvalStatus ?? "").trim();
  if (st === "approved" || st === "pending" || st === "under_review" || st === "revision_requested") {
    return null;
  }
  return { ok: false, status: 403, error: st === "suspended" ? "store_suspended" : "store_not_approved" };
}

/** 소유 확인 + 운영 쓰기 게이트 */
export async function getStoreIfOwnerForOperationalWrite(
  sb: AnySb,
  userId: string,
  storeId: string
): Promise<Awaited<ReturnType<typeof getStoreIfOwner>> | OwnerOperationalWriteBlock> {
  const gate = await getStoreIfOwner(sb, userId, storeId);
  if (!gate.ok) return gate;
  return ownerStoreOperationalWriteBlock(gate.store.approval_status) ?? gate;
}

/** 소유 확인을 따로 하는 라우트(쿠폰·파트너·팝업·이벤트)용 — 매장 상태만 확인 */
export async function ownerStoreOperationalWriteBlockById(
  sb: AnySb,
  storeId: string
): Promise<OwnerOperationalWriteBlock | null> {
  const { data } = await sb
    .from("stores")
    .select("approval_status")
    .eq("id", storeId.trim())
    .maybeSingle();
  return ownerStoreOperationalWriteBlock((data as { approval_status?: string } | null)?.approval_status);
}
