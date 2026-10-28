import "server-only";

/**
 * 관리자 샘플(체험용) 매장 운영 — 2026-10-28 배달 감사 §F S-1·S-2·S-5·S-7.
 * - 샘플 = `stores.store_kind = 'sample'`, 오너 없음(owner_user_id NULL), 판매 승인 없음(DB 트리거)
 * - 고객 노출은 다른 매장과 같은 `approval_status = approved AND is_visible` (전체 노출 = is_visible 일괄 변경)
 * - 메뉴·구역·이미지 쓰기는 오너와 같은 카탈로그 코어(`lib/stores/catalog/*`)를 관리자 샘플 정책으로 호출
 */
import { randomBytes } from "crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { clearStoreHomeFeedServerCache } from "@/lib/stores/store-home-feed-server-cache";
import { invalidateStorePublicCachesForSlugOnServer } from "@/lib/stores/store-public-cache-invalidate-server";
import { bumpStorePublicSharedCacheGeneration } from "@/lib/stores/store-public-shared-cache-generation";
import { invalidateStoreMenusSnapshotCacheByStoreId } from "@/lib/stores/store-menus-snapshot-invalidate-by-store-id";
import { buildStoreVisibilityWritePatch } from "@/lib/stores/store-first-listed-at";
import { normalizeStoreBusinessHoursJsonForWrite } from "@/lib/stores/owner-store-patch-fields";

export type AdminSampleStoreRow = {
  id: string;
  slug: string;
  store_name: string;
  store_kind: string;
  is_visible: boolean;
  approval_status: string;
};

/** 샘플 매장만 통과 (실매장 카탈로그는 오너 전용 — 관리자는 상태·검수 액션만) */
export async function requireAdminSampleStore(
  sb: SupabaseClient,
  storeId: string
): Promise<{ ok: true; store: AdminSampleStoreRow } | { ok: false; response: NextResponse }> {
  const { data, error } = await sb
    .from("stores")
    .select("id, slug, store_name, store_kind, is_visible, approval_status")
    .eq("id", storeId)
    .maybeSingle();
  if (error || !data) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "store_not_found" }, { status: 404 }) };
  }
  const row = data as AdminSampleStoreRow;
  if (row.store_kind !== "sample") {
    return { ok: false, response: NextResponse.json({ ok: false, error: "not_sample_store" }, { status: 403 }) };
  }
  return { ok: true, store: row };
}

/** 관리자 샘플 쓰기 직후 — 오너 쓰기·관리자 매장 PATCH 와 같은 공개 캐시 무효화 + 감사 */
export async function afterAdminSampleWrite(
  sb: SupabaseClient,
  req: NextRequest,
  input: {
    actorId: string;
    storeId: string;
    slug: string | null;
    action: string;
    before?: Record<string, unknown> | null;
    after: Record<string, unknown>;
  }
): Promise<void> {
  const rm = getAuditRequestMeta(req);
  await appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: input.actorId,
    target_type: "store",
    target_id: input.storeId,
    action: `store.sample.${input.action}`,
    before_json: input.before ?? null,
    after_json: input.after,
    ip: rm.ip,
    user_agent: rm.userAgent,
  });
  invalidateStoreMenusSnapshotCacheByStoreId(input.storeId);
  try {
    clearStoreHomeFeedServerCache();
    if (input.slug) invalidateStorePublicCachesForSlugOnServer(input.slug);
  } catch {
    /* best-effort */
  }
  bumpStorePublicSharedCacheGeneration(`admin_sample_store.${input.action}`);
}

export type CreateAdminSampleStoreBody = {
  storeName?: string;
  description?: string | null;
  storeCategoryId?: string;
  storeTopicId?: string | null;
  profileImageUrl?: string | null;
  coverImageUrl?: string | null;
  businessHoursJson?: unknown;
};

function sampleSlug(): string {
  return `sample-${randomBytes(4).toString("hex")}`;
}

/**
 * 샘플 매장 1곳 생성 — 숨김(is_visible=false)으로 만든 뒤 메뉴·이미지 검수 후 노출한다.
 * 배달·픽업 OFF (좌표 없음 → 배달 가능 지역 판정 대상 아님), 판매 승인 없음.
 */
export async function createAdminSampleStore(
  sb: SupabaseClient,
  body: CreateAdminSampleStoreBody
): Promise<{ ok: true; store: AdminSampleStoreRow } | { ok: false; status: number; error: string }> {
  const storeName = String(body.storeName ?? "").trim();
  if (storeName.length < 1 || storeName.length > 80) return { ok: false, status: 400, error: "invalid_store_name" };
  const categoryId = String(body.storeCategoryId ?? "").trim();
  if (!categoryId) return { ok: false, status: 400, error: "store_category_required" };

  const { data: cat } = await sb
    .from("store_categories")
    .select("id, name")
    .eq("id", categoryId)
    .eq("is_active", true)
    .maybeSingle();
  if (!cat) return { ok: false, status: 400, error: "invalid_store_category" };

  let topicName: string | null = null;
  const topicId = body.storeTopicId ? String(body.storeTopicId).trim() : "";
  if (topicId) {
    const { data: topic } = await sb
      .from("store_topics")
      .select("id, name, store_category_id")
      .eq("id", topicId)
      .eq("is_active", true)
      .maybeSingle();
    if (!topic || String((topic as { store_category_id?: unknown }).store_category_id) !== categoryId) {
      return { ok: false, status: 400, error: "invalid_store_topic" };
    }
    topicName = String((topic as { name?: unknown }).name ?? "") || null;
  }

  const catName = String((cat as { name?: unknown }).name ?? "");
  const hoursRes =
    body.businessHoursJson === undefined ? null : normalizeStoreBusinessHoursJsonForWrite(body.businessHoursJson);
  if (hoursRes && !hoursRes.ok) return { ok: false, status: 400, error: "invalid_business_hours" };
  const hours = hoursRes && hoursRes.ok ? hoursRes.value : null;

  const row: Record<string, unknown> = {
    store_kind: "sample",
    owner_user_id: null,
    store_name: storeName,
    slug: sampleSlug(),
    description: body.description != null ? String(body.description).trim().slice(0, 2000) || null : null,
    business_type: topicName ? `${catName} · ${topicName}` : catName,
    store_category_id: categoryId,
    store_topic_id: topicId || null,
    profile_image_url: body.profileImageUrl ? String(body.profileImageUrl).trim() : null,
    cover_image_url: body.coverImageUrl ? String(body.coverImageUrl).trim() : null,
    approval_status: "approved",
    approved_at: new Date().toISOString(),
    is_open: true,
    delivery_available: false,
    pickup_available: false,
    ...buildStoreVisibilityWritePatch(false),
    ...(hours ? { business_hours_json: hours } : {}),
  };

  const { data, error } = await sb
    .from("stores")
    .insert(row)
    .select("id, slug, store_name, store_kind, is_visible, approval_status")
    .maybeSingle();
  if (error || !data) {
    console.error("[createAdminSampleStore]", error);
    return { ok: false, status: 500, error: "db_error" };
  }
  return { ok: true, store: data as AdminSampleStoreRow };
}

/** S-7 — 샘플 전체 노출·숨김 = 샘플 매장들의 is_visible 일괄 변경 (노출 원천 단일) */
export async function setAllAdminSampleStoresVisible(
  sb: SupabaseClient,
  visible: boolean
): Promise<{ ok: true; storeIds: string[]; slugs: string[] } | { ok: false; error: string }> {
  const { data, error } = await sb
    .from("stores")
    .update(buildStoreVisibilityWritePatch(visible))
    .eq("store_kind", "sample")
    .eq("approval_status", "approved")
    .neq("is_visible", visible)
    .select("id, slug");
  if (error) {
    console.error("[setAllAdminSampleStoresVisible]", error);
    return { ok: false, error: "db_error" };
  }
  const rows = (data ?? []) as Array<{ id: string; slug: string }>;
  return { ok: true, storeIds: rows.map((r) => r.id), slugs: rows.map((r) => r.slug) };
}
