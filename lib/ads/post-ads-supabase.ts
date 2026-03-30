/**
 * `post_ads` · `ad_products` · `community_posts` — docs/ads-schema.sql 기준.
 * 테이블이 없거나 오류 시 호출부에서 인메모리(mock)로 폴백.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdApplyStatus, AdPaymentMethod, AdType, AdminPostAdRow, PostAd } from "@/lib/ads/types";

/** 인메모리 `PostAd` → 목록 API 공통 행 */
export function postAdToAdminRow(ad: PostAd): AdminPostAdRow {
  return {
    id: ad.id,
    postId: ad.postId,
    postTitle: ad.postTitle?.trim() || "(제목 없음)",
    userId: ad.userId,
    userNickname: ad.userNickname?.trim() || "",
    boardKey: ad.boardKey,
    adProductName: ad.adProductName?.trim() || "-",
    adType: ad.adType,
    applyStatus: ad.applyStatus,
    paymentMethod: ad.paymentMethod,
    pointCost: ad.pointCost,
    startAt: ad.startAt,
    endAt: ad.endAt,
    adminNote: ad.adminNote,
    createdAt: ad.createdAt,
  };
}

type PostAdJoinRow = {
  id: string;
  post_id: string;
  user_id: string;
  ad_product_id: string;
  board_key: string;
  ad_type: string;
  apply_status: string;
  payment_method: string;
  point_cost: number;
  paid_amount: number;
  start_at: string | null;
  end_at: string | null;
  priority: number;
  is_active: boolean;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
  ad_products?: { name?: string } | { name?: string }[] | null;
  community_posts?: { title?: string } | { title?: string }[] | null;
};

function embedField<T extends Record<string, unknown>>(
  v: T | T[] | null | undefined,
  key: keyof T
): string | null {
  if (v == null) return null;
  const o = Array.isArray(v) ? v[0] : v;
  if (!o || typeof o !== "object") return null;
  const x = o[key];
  return typeof x === "string" && x.trim() ? x.trim() : null;
}

export function mapJoinedPostAdRow(row: PostAdJoinRow): AdminPostAdRow {
  return {
    id: row.id,
    postId: row.post_id,
    postTitle: embedField(row.community_posts as { title?: string } | null, "title") ?? "(제목 없음)",
    userId: row.user_id,
    userNickname: "",
    boardKey: row.board_key ?? "plife",
    adProductName: embedField(row.ad_products as { name?: string } | null, "name") ?? "-",
    adType: row.ad_type as AdType,
    applyStatus: row.apply_status as AdApplyStatus,
    paymentMethod: row.payment_method as AdPaymentMethod,
    pointCost: Number(row.point_cost) || 0,
    startAt: row.start_at,
    endAt: row.end_at,
    adminNote: row.admin_note,
    createdAt: row.created_at,
  };
}

const POST_ADS_SELECT = `
  id, post_id, user_id, ad_product_id, board_key, ad_type, apply_status, payment_method,
  point_cost, paid_amount, start_at, end_at, priority, is_active, admin_note, created_at, updated_at,
  ad_products ( name ),
  community_posts ( title )
`;

function isMissingPostAdsRelation(err: { code?: string; message?: string }): boolean {
  const m = (err.message ?? "").toLowerCase();
  return (
    err.code === "42P01" ||
    m.includes("does not exist") ||
    m.includes("relation") && m.includes("post_ads")
  );
}

export async function fetchPostAdsForUserFromDb(
  sb: SupabaseClient,
  userId: string
): Promise<{ ok: true; rows: AdminPostAdRow[] } | { ok: false; reason: "missing_table" | "error"; message?: string }> {
  const { data, error } = await sb
    .from("post_ads")
    .select(POST_ADS_SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingPostAdsRelation(error)) {
      return { ok: false, reason: "missing_table" };
    }
    return { ok: false, reason: "error", message: error.message };
  }

  return { ok: true, rows: (data ?? []).map((r) => mapJoinedPostAdRow(r as PostAdJoinRow)) };
}

export async function fetchAllPostAdsForAdminFromDb(
  sb: SupabaseClient
): Promise<{ ok: true; rows: AdminPostAdRow[] } | { ok: false; reason: "missing_table" | "error"; message?: string }> {
  const { data, error } = await sb.from("post_ads").select(POST_ADS_SELECT).order("created_at", { ascending: false });

  if (error) {
    if (isMissingPostAdsRelation(error)) {
      return { ok: false, reason: "missing_table" };
    }
    return { ok: false, reason: "error", message: error.message };
  }

  return { ok: true, rows: (data ?? []).map((r) => mapJoinedPostAdRow(r as PostAdJoinRow)) };
}

export async function cancelPostAdForUserWithServiceRole(
  sb: SupabaseClient,
  userId: string,
  adId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: row, error: readErr } = await sb
    .from("post_ads")
    .select("id, user_id, apply_status")
    .eq("id", adId)
    .maybeSingle();

  if (readErr || !row) {
    return { ok: false, error: "not_found" };
  }
  if (String(row.user_id) !== userId) {
    return { ok: false, error: "forbidden" };
  }
  const st = String(row.apply_status);
  if (!["draft", "pending_payment", "pending_review"].includes(st)) {
    return { ok: false, error: "not_cancellable" };
  }

  const { error: upErr } = await sb
    .from("post_ads")
    .update({
      apply_status: "cancelled",
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", adId)
    .eq("user_id", userId);

  if (upErr) {
    return { ok: false, error: upErr.message || "update_failed" };
  }
  return { ok: true };
}

type AdminPatchAction = "approve" | "reject" | "cancel" | "expire";

/**
 * 서비스 롤 — 관리자 광고 처리. 성공 시 `{ ok: true }`, 해당 id 행 없으면 `{ ok: false, notFound: true }`.
 */
export async function adminPatchPostAdInDb(
  sb: SupabaseClient,
  adId: string,
  adminId: string,
  action: AdminPatchAction,
  adminNote?: string
): Promise<{ ok: true } | { ok: false; notFound?: boolean; error?: string }> {
  const { data: row, error: readErr } = await sb
    .from("post_ads")
    .select("id, ad_product_id, apply_status, payment_method, point_cost")
    .eq("id", adId)
    .maybeSingle();

  if (readErr || !row) {
    return { ok: false, notFound: true };
  }

  const now = new Date().toISOString();

  if (action === "reject") {
    const { error } = await sb
      .from("post_ads")
      .update({
        apply_status: "rejected",
        is_active: false,
        rejected_by: adminId,
        rejected_at: now,
        admin_note: adminNote ?? null,
        updated_at: now,
      })
      .eq("id", adId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  if (action === "cancel") {
    const { error } = await sb
      .from("post_ads")
      .update({
        apply_status: "cancelled",
        is_active: false,
        admin_note: adminNote ?? null,
        updated_at: now,
      })
      .eq("id", adId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  if (action === "expire") {
    const { error } = await sb
      .from("post_ads")
      .update({
        apply_status: "expired",
        is_active: false,
        admin_note: adminNote ?? null,
        updated_at: now,
      })
      .eq("id", adId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  /* approve */
  if (row.apply_status === "active" || row.apply_status === "approved") {
    return { ok: false, error: "already_approved" };
  }

  let durationDays = 3;
  if (row.ad_product_id) {
    const { data: prod } = await sb.from("ad_products").select("duration_days").eq("id", row.ad_product_id).maybeSingle();
    const d = Number(prod?.duration_days);
    if (Number.isFinite(d) && d > 0) durationDays = Math.floor(d);
  }

  const start = new Date();
  const end = new Date(start.getTime() + durationDays * 86400000);
  const { error } = await sb
    .from("post_ads")
    .update({
      apply_status: "active",
      is_active: true,
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      approved_by: adminId,
      approved_at: now,
      admin_note: adminNote ?? null,
      updated_at: now,
    })
    .eq("id", adId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
