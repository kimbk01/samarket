/**
 * `post_ads` · `ad_products` · `community_posts` — docs/ads-schema.sql 기준.
 * 테이블이 없으면 호출부에서 빈 목록·503 등으로 처리 (mock 폴백 없음).
 */
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AdApplyStatus,
  AdFeedPost,
  AdPaymentMethod,
  AdType,
  AdminPostAdRow,
  PostAd,
} from "@/lib/ads/types";
import { fetchAdProductByIdFromDb } from "@/lib/ads/ad-products-supabase";
import { labelFromDisplayAndUsername } from "@/lib/users/user-label";
import { formatCommunityPublicRegionLabel } from "@/lib/addresses/community-public-region-label";

/** 레거시 `PostAd` DTO → 어드민 목록 행 (DB 경로는 `mapJoinedPostAdRow`) */
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

function excerptFromPostBody(raw: string, max = 180): string {
  const t = String(raw ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max).trimEnd()}…`;
}

type ActiveAdFeedRow = {
  id: string;
  post_id: string;
  user_id: string;
  board_key: string;
  ad_type: string;
  priority: number;
  start_at: string;
  end_at: string;
  community_posts?: {
    title?: string | null;
    summary?: string | null;
    content?: string | null;
    region_label?: string | null;
  } | null;
};

/**
 * 피드 상단고정 광고 — 공개 API용 (서비스 롤로만 호출, RLS는 일반 사용자에게 post_ads 노출 안 함).
 * `docs/ads-schema.sql` + `community_posts` / `community_post_images` 스키마 기준.
 */
export async function fetchActiveTopFixedAdFeedPostsFromDb(
  sb: SupabaseClient,
  boardKey: string
): Promise<
  { ok: true; ads: AdFeedPost[] } | { ok: false; reason: "missing_table" | "error"; message?: string }
> {
  const bk = boardKey.trim() || "plife";
  const nowIso = new Date().toISOString();

  const { data, error } = await sb
    .from("post_ads")
    .select(
      `
      id,
      post_id,
      user_id,
      board_key,
      ad_type,
      priority,
      start_at,
      end_at,
      community_posts ( title, summary, content, region_label )
    `
    )
    .eq("board_key", bk)
    .eq("ad_type", "top_fixed")
    .eq("apply_status", "active")
    .eq("is_active", true)
    .not("start_at", "is", null)
    .not("end_at", "is", null)
    .lte("start_at", nowIso)
    .gte("end_at", nowIso)
    .order("priority", { ascending: true });

  if (error) {
    if (isMissingPostAdsRelation(error)) {
      return { ok: false, reason: "missing_table" };
    }
    return { ok: false, reason: "error", message: error.message };
  }

  const rows = (data ?? []) as ActiveAdFeedRow[];
  if (rows.length === 0) {
    return { ok: true, ads: [] };
  }

  const postIds = [...new Set(rows.map((r) => r.post_id).filter(Boolean))];
  const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];

  const imageByPostId = new Map<string, string[]>();
  if (postIds.length) {
    const { data: imgRows, error: imgErr } = await sb
      .from("community_post_images")
      .select("post_id, image_url, sort_order")
      .in("post_id", postIds)
      .order("sort_order", { ascending: true });
    if (!imgErr && Array.isArray(imgRows)) {
      for (const row of imgRows as { post_id?: string; image_url?: string }[]) {
        const pid = String(row.post_id ?? "");
        const url = typeof row.image_url === "string" ? row.image_url.trim() : "";
        if (!pid || !url) continue;
        const list = imageByPostId.get(pid) ?? [];
        list.push(url);
        imageByPostId.set(pid, list);
      }
    }
  }

  const nicknameById = new Map<string, string>();
  if (userIds.length) {
    const { data: profs } = await sb.from("profiles").select("id, display_name, nickname, username").in("id", userIds);
    for (const p of (profs ?? []) as { id?: string; display_name?: string | null; nickname?: string | null; username?: string | null }[]) {
      const id = String(p.id ?? "");
      const base = String(p.display_name ?? p.nickname ?? "").trim();
      const uname = String(p.username ?? "").trim();
      const label = labelFromDisplayAndUsername(base || null, uname || null) || base || uname || id.slice(0, 8);
      nicknameById.set(id, label);
    }
  }

  const ads: AdFeedPost[] = rows.map((row) => {
    const cp = row.community_posts;
    const post = Array.isArray(cp) ? cp[0] : cp ?? null;
    const title = String(post?.title ?? "").trim() || "(제목 없음)";
    const summaryRaw = String(post?.summary ?? "").trim();
    const postSummary = summaryRaw || excerptFromPostBody(String(post?.content ?? ""));
    const pid = String(row.post_id);
    const postImages = imageByPostId.get(pid) ?? [];
    const uid = String(row.user_id);
    return {
      adId: row.id,
      postId: pid,
      postTitle: title,
      postSummary,
      postImages,
      locationLabel: formatCommunityPublicRegionLabel({
        regionLabel: String(post?.region_label ?? "").trim(),
      }),
      boardKey: row.board_key ?? bk,
      adType: row.ad_type as AdType,
      priority: Number(row.priority) || 0,
      startAt: row.start_at,
      endAt: row.end_at,
      advertiserName: nicknameById.get(uid) ?? "회원",
    };
  });

  return { ok: true, ads };
}

export async function resolveCanonicalCommunityPostIdForAds(
  sb: SupabaseClient,
  rawId: string,
  userId?: string
): Promise<string | null> {
  const id = rawId.trim();
  if (!id) return null;

  const { data: direct } = await sb.from("community_posts").select("id").eq("id", id).maybeSingle();
  if (direct?.id) return String(direct.id);

  const { data: migrated, error } = await sb
    .from("community_posts")
    .select("id")
    .eq("source_legacy_post_id", id)
    .maybeSingle();
  if (!error && migrated?.id) return String(migrated.id);

  if (userId?.trim()) {
    const { ensureCommunityPostIdForAds } = await import(
      "@/lib/community-feed/ensure-community-post-for-ads"
    );
    return ensureCommunityPostIdForAds(sb, id, userId.trim());
  }

  return null;
}

export async function insertAdLogInDb(
  sb: SupabaseClient,
  postAdId: string,
  actorId: string | null,
  logType: string,
  payload: Record<string, unknown> = {}
): Promise<void> {
  const { error } = await sb.from("ad_logs").insert({
    post_ad_id: postAdId,
    actor_id: actorId,
    log_type: logType,
    payload,
  });
  if (error && process.env.NODE_ENV !== "production") {
    console.warn("[post-ads-supabase] ad_logs insert:", error.message);
  }
}

export interface ApplyPostAdInput {
  postId: string;
  userId: string;
  adProductId: string;
  paymentMethod: AdPaymentMethod;
  depositorName?: string;
  memo?: string;
  pointsPreDeducted?: boolean;
  paidAmount?: number;
  presetAdId?: string;
}

export async function applyPostAdInDb(
  sb: SupabaseClient,
  input: ApplyPostAdInput
): Promise<
  | { ok: true; adId: string }
  | { ok: false; error: string; pointShortfall?: number }
> {
  const productRes = await fetchAdProductByIdFromDb(sb, input.adProductId);
  if (!productRes.ok) {
    return { ok: false, error: "ad_product_not_found" };
  }
  const product = productRes.product;
  if (!product.isActive) {
    return { ok: false, error: "ad_product_inactive" };
  }

  const canonicalPostId = await resolveCanonicalCommunityPostIdForAds(sb, input.postId, input.userId);
  if (!canonicalPostId) {
    return { ok: false, error: "post_not_found" };
  }

  const { data: existing } = await sb
    .from("post_ads")
    .select("id")
    .eq("post_id", canonicalPostId)
    .in("apply_status", ["pending_review", "approved", "active", "pending_payment"])
    .limit(1);
  if ((existing ?? []).length > 0) {
    return { ok: false, error: "already_has_active_ad" };
  }

  const adId = input.presetAdId?.trim() || randomUUID();
  const now = new Date().toISOString();
  const applyStatus: AdApplyStatus =
    input.paymentMethod === "points" ? "pending_review" : "pending_payment";
  const paidAmount =
    input.paymentMethod === "points"
      ? input.pointsPreDeducted
        ? product.pointCost
        : Number(input.paidAmount) || 0
      : 0;

  const { error: insErr } = await sb.from("post_ads").insert({
    id: adId,
    post_id: canonicalPostId,
    user_id: input.userId,
    ad_product_id: product.id,
    board_key: product.boardKey ?? "plife",
    ad_type: product.adType,
    apply_status: applyStatus,
    payment_method: input.paymentMethod,
    point_cost: product.pointCost,
    paid_amount: paidAmount,
    priority: product.priorityDefault,
    is_active: false,
    admin_note: input.memo?.trim() || null,
    created_at: now,
    updated_at: now,
  });

  if (insErr) {
    if (isMissingPostAdsRelation(insErr)) {
      return { ok: false, error: "missing_table" };
    }
    return { ok: false, error: insErr.message || "insert_failed" };
  }

  if (input.paymentMethod === "bank_transfer") {
    const { error: payErr } = await sb.from("ad_payment_requests").insert({
      post_ad_id: adId,
      user_id: input.userId,
      payment_method: "bank_transfer",
      depositor_name: input.depositorName?.trim() || "",
      requested_amount: product.pointCost,
      memo: input.memo?.trim() || null,
      payment_status: "pending",
    });
    if (payErr && process.env.NODE_ENV !== "production") {
      console.warn("[post-ads-supabase] ad_payment_requests:", payErr.message);
    }
  }

  await insertAdLogInDb(sb, adId, input.userId, "applied", {
    product: product.name,
    method: input.paymentMethod,
  });

  return { ok: true, adId };
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

  const rows = (data ?? []).map((r) => mapJoinedPostAdRow(r as PostAdJoinRow));
  const enriched = await enrichAdminPostAdRowsWithProfiles(sb, rows);
  return { ok: true, rows: enriched };
}

async function enrichAdminPostAdRowsWithProfiles(
  sb: SupabaseClient,
  rows: AdminPostAdRow[]
): Promise<AdminPostAdRow[]> {
  if (rows.length === 0) return rows;
  const userIds = [...new Set(rows.map((r) => r.userId).filter(Boolean))];
  if (userIds.length === 0) return rows;

  const nicknameById = new Map<string, string>();
  const { data: profs } = await sb
    .from("profiles")
    .select("id, display_name, nickname, username")
    .in("id", userIds);
  for (const p of (profs ?? []) as {
    id?: string;
    display_name?: string | null;
    nickname?: string | null;
    username?: string | null;
  }[]) {
    const id = String(p.id ?? "");
    const base = String(p.display_name ?? p.nickname ?? "").trim();
    const uname = String(p.username ?? "").trim();
    const label = labelFromDisplayAndUsername(base || null, uname || null) || base || uname || id.slice(0, 8);
    nicknameById.set(id, label);
  }

  return rows.map((r) => ({
    ...r,
    userNickname: nicknameById.get(r.userId) ?? r.userNickname,
  }));
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

  const rows = (data ?? []).map((r) => mapJoinedPostAdRow(r as PostAdJoinRow));
  const enriched = await enrichAdminPostAdRowsWithProfiles(sb, rows);
  return { ok: true, rows: enriched };
}

export async function fetchPostAdByIdForAdminFromDb(
  sb: SupabaseClient,
  adId: string
): Promise<
  | { ok: true; row: AdminPostAdRow; durationDays: number }
  | { ok: false; notFound: true }
  | { ok: false; reason: "error"; message?: string }
> {
  const { data, error } = await sb
    .from("post_ads")
    .select(POST_ADS_SELECT)
    .eq("id", adId)
    .maybeSingle();

  if (error) {
    if (isMissingPostAdsRelation(error)) {
      return { ok: false, notFound: true };
    }
    return { ok: false, reason: "error", message: error.message };
  }
  if (!data) {
    return { ok: false, notFound: true };
  }

  const [row] = await enrichAdminPostAdRowsWithProfiles(sb, [mapJoinedPostAdRow(data as PostAdJoinRow)]);

  let durationDays = 3;
  const joinRow = data as PostAdJoinRow;
  if (joinRow.ad_product_id) {
    const { data: prod } = await sb
      .from("ad_products")
      .select("duration_days")
      .eq("id", joinRow.ad_product_id)
      .maybeSingle();
    const d = Number(prod?.duration_days);
    if (Number.isFinite(d) && d > 0) durationDays = Math.floor(d);
  }

  return { ok: true, row, durationDays };
}

export async function fetchAdLogsForPostAdFromDb(
  sb: SupabaseClient,
  postAdId: string
): Promise<
  { ok: true; logs: { id: string; post_ad_id: string; actor_id: string | null; log_type: string; payload: Record<string, unknown> | null; created_at: string }[] }
  | { ok: false; reason: "missing_table" | "error"; message?: string }
> {
  const { data, error } = await sb
    .from("ad_logs")
    .select("id, post_ad_id, actor_id, log_type, payload, created_at")
    .eq("post_ad_id", postAdId)
    .order("created_at", { ascending: false });

  if (error) {
    const m = (error.message ?? "").toLowerCase();
    if (error.code === "42P01" || m.includes("ad_logs")) {
      return { ok: false, reason: "missing_table" };
    }
    return { ok: false, reason: "error", message: error.message };
  }

  return { ok: true, logs: (data ?? []) as { id: string; post_ad_id: string; actor_id: string | null; log_type: string; payload: Record<string, unknown> | null; created_at: string }[] };
}

export async function updatePostAdAdminNoteInDb(
  sb: SupabaseClient,
  adId: string,
  adminNote: string
): Promise<{ ok: true } | { ok: false; notFound?: boolean; error?: string }> {
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("post_ads")
    .update({ admin_note: adminNote.trim() || null, updated_at: now })
    .eq("id", adId)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, notFound: true };
  return { ok: true };
}

export type RefundPostAdPointsErrorCode =
  | "forbidden"
  | "invalid_input"
  | "not_found"
  | "not_owner"
  | "not_cancellable"
  | "rpc_failed";

export type RefundPostAdPointsResult =
  | {
      ok: true;
      idempotent: boolean;
      refundedAmount: number;
      ledgerId: string | null;
      status: string;
    }
  | { ok: false; error: RefundPostAdPointsErrorCode | string; currentStatus?: string; message?: string };

/**
 * DB SSOT — `refund_post_ad_points` (service role).
 * post_ads 행 잠금 + 원장 기준 환불 + 상태 전이 + 잔액 projection 을 한 트랜잭션에서 처리.
 */
export async function refundPostAdPointsViaRpc(
  sb: SupabaseClient,
  input: {
    userId: string;
    adId: string;
    actorType: "user" | "admin";
    actorId: string;
    targetStatus: "cancelled" | "rejected";
    reason: string | null;
  }
): Promise<RefundPostAdPointsResult> {
  const { data, error } = await sb.rpc("refund_post_ad_points", {
    p_user_id: input.userId,
    p_ad_id: input.adId,
    p_actor_type: input.actorType,
    p_actor_id: input.actorId,
    p_target_status: input.targetStatus,
    p_reason: input.reason,
  });
  if (error) {
    return { ok: false, error: "rpc_failed", message: error.message };
  }
  const j = (data ?? {}) as Record<string, unknown>;
  if (j.ok !== true) {
    const err = typeof j.error === "string" && j.error.trim() ? j.error.trim() : "rpc_failed";
    return {
      ok: false,
      error: err,
      currentStatus: typeof j.current_status === "string" ? j.current_status : undefined,
    };
  }
  return {
    ok: true,
    idempotent: j.idempotent === true,
    refundedAmount: Math.trunc(Number(j.refunded_amount) || 0),
    ledgerId: typeof j.ledger_id === "string" && j.ledger_id ? j.ledger_id : null,
    status: typeof j.status === "string" ? j.status : input.targetStatus,
  };
}

/** refund_post_ad_points 오류 → HTTP status (routes 공용) */
export function httpStatusForRefundPostAdPointsError(error: string | undefined): number {
  switch (error) {
    case "not_found":
      return 404;
    case "not_owner":
      return 403;
    case "not_cancellable":
      return 409;
    case "invalid_input":
      return 400;
    case "not_allowed":
      return 409;
    case "forbidden":
    default:
      return 500;
  }
}

export async function cancelPostAdForUserWithServiceRole(
  sb: SupabaseClient,
  userId: string,
  adId: string,
  /** @deprecated 환불은 DB RPC `refund_post_ad_points` 가 수행 — 무시됨 (호환용 시그니처). */
  _options?: { refundPoints?: (input: { userId: string; pointCost: number; adProductName?: string }) => Promise<void> }
): Promise<{ ok: true; idempotent?: boolean; refundedAmount?: number } | { ok: false; error: string; currentStatus?: string }> {
  const r = await refundPostAdPointsViaRpc(sb, {
    userId,
    adId,
    actorType: "user",
    actorId: userId,
    targetStatus: "cancelled",
    reason: null,
  });
  if (!r.ok) {
    return { ok: false, error: r.error, currentStatus: r.currentStatus };
  }
  if (!r.idempotent) {
    await insertAdLogInDb(sb, adId, userId, "cancelled", { refunded_amount: r.refundedAmount });
  }
  return { ok: true, idempotent: r.idempotent, refundedAmount: r.refundedAmount };
}

type AdminPatchAction = "approve" | "reject" | "cancel" | "expire" | "confirm_payment";

/** 관리자 상태 전이 허용 원본 상태 — UPDATE 조건(.in) 으로 강제 (TOCTOU 방지). */
export const ADMIN_POST_AD_TRANSITION_FROM: Record<
  "approve" | "cancel" | "expire" | "confirm_payment",
  readonly AdApplyStatus[]
> = {
  approve: ["pending_payment", "pending_review"],
  /* 관리자 UI 는 cancelled/expired 외 행에 취소 버튼 노출 — 노출 중(active) 강제 취소 유지, rejected 제외 */
  cancel: ["draft", "pending_payment", "pending_review", "approved", "active"],
  expire: ["active", "approved"],
  confirm_payment: ["pending_payment"],
};

/**
 * 서비스 롤 — 관리자 광고 처리. 성공 시 `{ ok: true }`, 해당 id 행 없으면 `{ ok: false, notFound: true }`.
 * - reject: DB RPC `refund_post_ad_points` (환불+상태 전이 원자 처리)
 * - approve/cancel/expire/confirm_payment: 상태 조건부 UPDATE, 0행이면 `not_allowed`
 */
export async function adminPatchPostAdInDb(
  sb: SupabaseClient,
  adId: string,
  adminId: string,
  action: AdminPatchAction,
  adminNote?: string,
  /** @deprecated 환불은 DB RPC `refund_post_ad_points` 가 수행 — 무시됨 (호환용 시그니처). */
  _options?: { refundPoints?: (input: { userId: string; pointCost: number; adProductName?: string }) => Promise<void> }
): Promise<{ ok: true } | { ok: false; notFound?: boolean; error?: string; httpStatus?: number }> {
  const { data: row, error: readErr } = await sb
    .from("post_ads")
    .select("id, user_id, ad_product_id, apply_status, payment_method, point_cost, paid_amount")
    .eq("id", adId)
    .maybeSingle();

  if (readErr || !row) {
    return { ok: false, notFound: true };
  }

  const now = new Date().toISOString();

  const conditionalUpdate = async (
    from: readonly AdApplyStatus[],
    patch: Record<string, unknown>
  ): Promise<{ ok: true } | { ok: false; error: string; httpStatus?: number }> => {
    const { data, error } = await sb
      .from("post_ads")
      .update(patch)
      .eq("id", adId)
      .in("apply_status", [...from])
      .select("id");
    if (error) return { ok: false, error: error.message };
    if (!Array.isArray(data) || data.length === 0) {
      return { ok: false, error: "not_allowed", httpStatus: 409 };
    }
    return { ok: true };
  };

  if (action === "confirm_payment") {
    if (row.apply_status !== "pending_payment") {
      return { ok: false, error: "not_pending_payment" };
    }
    const up = await conditionalUpdate(ADMIN_POST_AD_TRANSITION_FROM.confirm_payment, {
      apply_status: "pending_review",
      admin_note: adminNote ?? null,
      updated_at: now,
    });
    if (!up.ok) return up;
    await insertAdLogInDb(sb, adId, adminId, "payment_confirmed", { note: adminNote ?? "" });
    return { ok: true };
  }

  if (action === "reject") {
    const r = await refundPostAdPointsViaRpc(sb, {
      userId: String(row.user_id ?? ""),
      adId,
      actorType: "admin",
      actorId: adminId,
      targetStatus: "rejected",
      reason: adminNote ?? null,
    });
    if (!r.ok) {
      if (r.error === "not_found") return { ok: false, notFound: true };
      return { ok: false, error: r.error, httpStatus: httpStatusForRefundPostAdPointsError(r.error) };
    }
    if (!r.idempotent) {
      await insertAdLogInDb(sb, adId, adminId, "rejected", {
        note: adminNote ?? "",
        refunded_amount: r.refundedAmount,
      });
    }
    return { ok: true };
  }

  if (action === "cancel") {
    const up = await conditionalUpdate(ADMIN_POST_AD_TRANSITION_FROM.cancel, {
      apply_status: "cancelled",
      is_active: false,
      admin_note: adminNote ?? null,
      updated_at: now,
    });
    if (!up.ok) return up;
    await insertAdLogInDb(sb, adId, adminId, "cancelled", { note: adminNote ?? "" });
    return { ok: true };
  }

  if (action === "expire") {
    const up = await conditionalUpdate(ADMIN_POST_AD_TRANSITION_FROM.expire, {
      apply_status: "expired",
      is_active: false,
      admin_note: adminNote ?? null,
      updated_at: now,
    });
    if (!up.ok) return up;
    await insertAdLogInDb(sb, adId, adminId, "expired", { note: adminNote ?? "" });
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
  const up = await conditionalUpdate(ADMIN_POST_AD_TRANSITION_FROM.approve, {
    apply_status: "active",
    is_active: true,
    start_at: start.toISOString(),
    end_at: end.toISOString(),
    approved_by: adminId,
    approved_at: now,
    admin_note: adminNote ?? null,
    updated_at: now,
  });
  if (!up.ok) return up;
  await insertAdLogInDb(sb, adId, adminId, "approved", { note: adminNote ?? "" });
  return { ok: true };
}
