/**
 * 회원 제재(정지·차단) → 그 회원이 사장님인 매장의 판매를 자동 중지 (DEF-68, Owner 승인 권장안).
 * 사장님이 주문을 처리할 수 없는데 고객 주문이 계속 들어오는 상태를 막는다.
 * 제재 해제 시 판매는 자동 재개하지 않는다 — 관리자가 매장 상세에서 확인 후 「판매 승인」.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { safeNotifyOwnerStoreDecision } from "@/lib/admin-business/admin-store-decision";

export const MEMBER_SANCTION_SALES_SUSPEND_PREFIX = "[회원 제재 자동 판매 중지]";

export type OwnerStoreSalesSanctionResult = {
  storeId: string;
  storeName: string | null;
  changed: boolean;
};

export async function suspendOwnerStoreSalesOnMemberSanction(
  sb: SupabaseClient,
  input: { userId: string; actorId: string | null; sanction: "suspend" | "ban"; reason: string }
): Promise<OwnerStoreSalesSanctionResult[]> {
  const out: OwnerStoreSalesSanctionResult[] = [];
  try {
    const { data: stores, error } = await sb
      .from("stores")
      .select("id, store_name, owner_user_id")
      .eq("owner_user_id", input.userId)
      .eq("approval_status", "approved");
    if (error || !stores?.length) return out;

    for (const s of stores as { id: string; store_name: string | null }[]) {
      const { data: perm } = await sb
        .from("store_sales_permissions")
        .select("allowed_to_sell, sales_status, suspension_reason")
        .eq("store_id", s.id)
        .maybeSingle();
      const selling =
        Boolean((perm as { allowed_to_sell?: boolean } | null)?.allowed_to_sell) ||
        String((perm as { sales_status?: string } | null)?.sales_status ?? "") === "approved";
      if (!selling) {
        out.push({ storeId: s.id, storeName: s.store_name, changed: false });
        continue;
      }
      const suspensionReason = `${MEMBER_SANCTION_SALES_SUSPEND_PREFIX} ${input.reason}`.slice(0, 1000);
      const { error: upErr } = await sb.from("store_sales_permissions").upsert(
        {
          store_id: s.id,
          allowed_to_sell: false,
          sales_status: "suspended",
          suspension_reason: suspensionReason,
        },
        { onConflict: "store_id" }
      );
      if (upErr) {
        console.error("[suspendOwnerStoreSalesOnMemberSanction]", s.id, upErr.message);
        out.push({ storeId: s.id, storeName: s.store_name, changed: false });
        continue;
      }
      void appendAuditLog(sb, {
        actor_type: "admin",
        actor_id: input.actorId,
        target_type: "store",
        target_id: s.id,
        action: "store.suspend_sales_member_sanction",
        before_json: (perm as Record<string, unknown> | null) ?? null,
        after_json: {
          allowed_to_sell: false,
          sales_status: "suspended",
          suspension_reason: suspensionReason,
          owner_user_id: input.userId,
          sanction: input.sanction,
        },
      });
      await safeNotifyOwnerStoreDecision(sb, {
        action: "suspend_sales",
        storeId: s.id,
        ownerUserId: input.userId,
        storeName: s.store_name,
        reason: suspensionReason,
        adminActorId: input.actorId,
      });
      out.push({ storeId: s.id, storeName: s.store_name, changed: true });
    }
  } catch (err) {
    console.error("[suspendOwnerStoreSalesOnMemberSanction]", input.userId, err);
  }
  return out;
}

/** 제재 해제 시: 회원 제재로 자동 중지된 매장 목록 (관리자 경고용, 자동 재개 안 함). */
export async function listOwnerStoresSalesSuspendedBySanction(
  sb: SupabaseClient,
  userId: string
): Promise<OwnerStoreSalesSanctionResult[]> {
  try {
    const { data: stores } = await sb
      .from("stores")
      .select("id, store_name")
      .eq("owner_user_id", userId)
      .eq("approval_status", "approved");
    if (!stores?.length) return [];
    const ids = (stores as { id: string }[]).map((s) => s.id);
    const { data: perms } = await sb
      .from("store_sales_permissions")
      .select("store_id, sales_status, suspension_reason")
      .in("store_id", ids);
    const hit = new Set(
      ((perms ?? []) as { store_id: string; sales_status?: string; suspension_reason?: string | null }[])
        .filter(
          (p) =>
            p.sales_status === "suspended" &&
            String(p.suspension_reason ?? "").startsWith(MEMBER_SANCTION_SALES_SUSPEND_PREFIX)
        )
        .map((p) => p.store_id)
    );
    return (stores as { id: string; store_name: string | null }[])
      .filter((s) => hit.has(s.id))
      .map((s) => ({ storeId: s.id, storeName: s.store_name, changed: false }));
  } catch {
    return [];
  }
}
