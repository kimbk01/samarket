/**
 * 3-C §9-3 — 관리자 샘플 매장 카탈로그 편집 게이트 (server-only).
 * `requireAdminPermission("business")` + 서버에서 `stores.store_kind = 'sample'` 재검증.
 * 실매장·테스트 매장은 403 `not_sample_store` (관리자 메뉴 편집은 샘플 한정 — 실매장은 기존 9종 조치 유지).
 * 통과하면 오너와 같은 저장 코어(`lib/stores/owner-catalog/*`)를 `admin_sample` 주체로 호출한다.
 */
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import type { StoreGateRow } from "@/lib/stores/owner-product-gate";
import {
  adminSampleCatalogActor,
  type StoreCatalogActor,
} from "@/lib/stores/owner-catalog/store-catalog-actor";

export const NOT_SAMPLE_STORE_ERROR = "not_sample_store" as const;

export type AdminSampleCatalogStore = StoreGateRow & { slug: string | null; store_kind: string };

export async function requireAdminSampleCatalogStore(
  rawStoreId: string
): Promise<
  | { ok: true; sb: SupabaseClient<any>; actor: StoreCatalogActor; store: AdminSampleCatalogStore }
  | { ok: false; response: NextResponse }
> {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return { ok: false, response: gate.response };

  const sid = typeof rawStoreId === "string" ? rawStoreId.trim() : "";
  if (!sid) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "missing_store_id" }, { status: 400 }) };
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 }) };
  }

  const { data: store, error } = await sb
    .from("stores")
    .select("id, owner_user_id, approval_status, owner_can_edit_store_identity, store_kind, slug")
    .eq("id", sid)
    .maybeSingle();
  if (error || !store) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "store_not_found" }, { status: 404 }) };
  }
  const row = store as Record<string, unknown>;
  if (row.store_kind !== "sample") {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: NOT_SAMPLE_STORE_ERROR }, { status: 403 }),
    };
  }

  const actorId = (await getRouteUserId()) ?? gate.actor.userId;
  return {
    ok: true,
    sb: sb as SupabaseClient<any>,
    actor: adminSampleCatalogActor(actorId),
    store: {
      id: String(row.id),
      owner_user_id: typeof row.owner_user_id === "string" ? row.owner_user_id : "",
      approval_status: String(row.approval_status ?? ""),
      owner_can_edit_store_identity: row.owner_can_edit_store_identity === true,
      slug: typeof row.slug === "string" ? row.slug : null,
      store_kind: "sample",
    },
  };
}

/** 관리자 샘플 카탈로그 변경 감사 (성공 응답일 때 호출부가 1회). */
export async function appendAdminSampleCatalogAudit(input: {
  sb: SupabaseClient<any>;
  actor: StoreCatalogActor;
  storeId: string;
  action: string;
  req: Request;
  after?: Record<string, unknown>;
}): Promise<void> {
  const rm = getAuditRequestMeta(input.req);
  await appendAuditLog(input.sb as SupabaseClient, {
    actor_type: "admin",
    actor_id: input.actor.userId,
    target_type: "store",
    target_id: input.storeId,
    action: `store.admin_sample_catalog.${input.action}`,
    before_json: null,
    after_json: { store_kind: "sample", ...(input.after ?? {}) },
    ip: rm.ip,
    user_agent: rm.userAgent,
  });
}
