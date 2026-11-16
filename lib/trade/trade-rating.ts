/**
 * 거래 평가 — CREW REP S5 (Owner 2026-11-16 「거래 평가 살리기」·「S5 진행해」, 설계 §7).
 *
 * - 구매자 지정·구매 확정은 없다(10-28 계약 유지). **실제로 대화한 거래 상대끼리만** 서로 평가한다.
 * - 자격 E1~E7 은 서버만 판정한다 (`evaluateTradeRatingEligibility`). 화면은 결과만 그린다.
 * - 동시 공개: 양쪽 제출 또는 첫 제출 후 7일 → revealed. 공개 전에는 서로 볼 수 없고 점수에도 없다.
 * - 아쉬워요는 태그 1개 이상 필수, 받은 사람은 공개 후 14일 안에 1회 이의제기 → 운영자 결정.
 * - 쓰기·읽기는 서버(service role)만. 앱 사용자의 직접 접근은 RLS 로 막는다(D14·D15).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { CREW_REP_TRADE_RATING as R } from "@/lib/trust/crew-rep-policy";
import { crewRepSanctionEventType } from "@/lib/trust/crew-rep-policy";
import {
  allowedTagKeys,
  type TradeHappened,
  type TradeRatingRole,
  type TradeRatingType,
} from "@/lib/trade/trade-rating-client";

export { allowedTagKeys };
export type { TradeHappened, TradeRatingRole, TradeRatingType };

type Sb = SupabaseClient<any>;
const MIN_MS = 60_000;
const DAY_MS = 86_400_000;


export type TradeRatingIneligibleReason =
  | "not_participant"
  | "not_enough_messages"
  | "conversation_too_short"
  | "window_not_open"
  | "window_closed"
  | "already_rated"
  | "shared_device"
  | "blocked"
  | "account_unavailable";

export type TradeRatingFacts = {
  sellerId: string;
  buyerId: string;
  viewerId: string;
  /** 판매자·구매자가 보낸 메시지 (시스템·삭제 제외) */
  messages: { sender_id: string; created_at: string }[];
  soldAt: string | null;
  myReviewId: string | null;
  sharedDevice: boolean;
  blocked: boolean;
  accountUnavailable: boolean;
};

export type TradeRatingEligibility = {
  eligible: boolean;
  reasons: TradeRatingIneligibleReason[];
  role: TradeRatingRole | null;
  counterpartId: string | null;
  messageCounts: { seller: number; buyer: number };
  windowOpensAt: string | null;
  windowEndsAt: string | null;
};

/** 자격 판정 (순수 함수) — E1~E7. */
export function evaluateTradeRatingEligibility(f: TradeRatingFacts, now: Date): TradeRatingEligibility {
  const reasons: TradeRatingIneligibleReason[] = [];
  const isSeller = f.viewerId === f.sellerId;
  const isBuyer = f.viewerId === f.buyerId;
  const role: TradeRatingRole | null = isSeller ? "seller_to_buyer" : isBuyer ? "buyer_to_seller" : null;
  const counterpartId = isSeller ? f.buyerId : isBuyer ? f.sellerId : null;
  if (!role || f.sellerId === f.buyerId) reasons.push("not_participant");

  const seller = f.messages.filter((m) => m.sender_id === f.sellerId);
  const buyer = f.messages.filter((m) => m.sender_id === f.buyerId);
  if (seller.length < R.minMessagesEach || buyer.length < R.minMessagesEach) reasons.push("not_enough_messages");

  const times = [...seller, ...buyer].map((m) => new Date(m.created_at).getTime()).sort((a, b) => a - b);
  const first = times[0];
  const last = times[times.length - 1];
  if (first == null || last == null || last - first < R.minConversationMinutes * MIN_MS) {
    reasons.push("conversation_too_short");
  }

  let opensMs: number | null = null;
  if (first != null) {
    const byDays = first + R.openAfterFirstMessageDays * DAY_MS;
    const sold = f.soldAt ? new Date(f.soldAt).getTime() : null;
    opensMs = sold != null ? Math.min(sold, byDays) : byDays;
  }
  const endsMs = opensMs != null ? opensMs + R.windowDays * DAY_MS : null;
  const nowMs = now.getTime();
  if (opensMs == null || nowMs < opensMs) reasons.push("window_not_open");
  else if (endsMs != null && nowMs > endsMs) reasons.push("window_closed");

  if (f.myReviewId) reasons.push("already_rated");
  if (f.sharedDevice) reasons.push("shared_device");
  if (f.blocked) reasons.push("blocked");
  if (f.accountUnavailable) reasons.push("account_unavailable");

  return {
    eligible: reasons.length === 0,
    reasons,
    role,
    counterpartId,
    messageCounts: { seller: seller.length, buyer: buyer.length },
    windowOpensAt: opensMs != null ? new Date(opensMs).toISOString() : null,
    windowEndsAt: endsMs != null ? new Date(endsMs).toISOString() : null,
  };
}

/** 거래 확인 가중 w (순수 함수). 한쪽 「했어요」 + 다른 쪽 「대화만」이면 둘 다 0.7. */
export function tradeRatingWeight(mine: TradeHappened, counterpart: TradeHappened | null): number {
  if (mine === "chat_only" && counterpart !== "yes") return R.weightChatOnly;
  if (mine === "yes" && counterpart === "yes") return R.weightBothYes;
  return R.weightOneYes;
}

/** 입력 검증 (순수 함수). 아쉬워요는 태그 1개 이상. */
export function validateTradeRatingInput(
  role: TradeRatingRole,
  raw: { tradeHappened?: unknown; ratingType?: unknown; tags?: unknown; comment?: unknown }
):
  | { ok: true; tradeHappened: TradeHappened; ratingType: TradeRatingType; tags: string[]; comment: string | null }
  | { ok: false; error: string } {
  const th = raw.tradeHappened;
  if (th !== "yes" && th !== "chat_only") return { ok: false, error: "invalid_trade_happened" };
  const rt = raw.ratingType;
  if (rt !== "good" && rt !== "normal" && rt !== "bad") return { ok: false, error: "invalid_rating" };
  const allowed = new Set(allowedTagKeys(role, rt));
  const tags = Array.isArray(raw.tags) ? [...new Set(raw.tags.map(String))] : [];
  if (tags.some((k) => !allowed.has(k))) return { ok: false, error: "invalid_tags" };
  if (rt === "bad" && tags.length === 0) return { ok: false, error: "bad_rating_tag_required" };
  const c = typeof raw.comment === "string" ? raw.comment.trim() : "";
  if (c.length > R.commentMax) return { ok: false, error: "comment_too_long" };
  return { ok: true, tradeHappened: th, ratingType: rt, tags, comment: c || null };
}

export type TradeRatingRow = {
  id: string;
  room_id: string;
  product_id: string;
  reviewer_id: string;
  reviewee_id: string;
  role_type: TradeRatingRole;
  public_review_type: TradeRatingType;
  positive_tag_keys: string[] | null;
  negative_tag_keys: string[] | null;
  trade_happened: TradeHappened | null;
  rating_status: "pending_reveal" | "revealed" | "disputed" | "reversed";
  revealed_at: string | null;
  disputed_at: string | null;
  dispute_decision: "accepted" | "rejected" | null;
  is_hidden_by_admin: boolean | null;
  created_at: string;
};

export const TRADE_RATING_SELECT =
  "id, room_id, product_id, reviewer_id, reviewee_id, role_type, public_review_type, positive_tag_keys, negative_tag_keys, trade_happened, rating_status, revealed_at, disputed_at, dispute_decision, is_hidden_by_admin, created_at";

/** 이의제기 가능 여부 (순수 함수). */
export function canDisputeTradeRating(row: TradeRatingRow, viewerId: string, now: Date): boolean {
  if (row.reviewee_id !== viewerId || row.public_review_type !== "bad") return false;
  if (row.rating_status !== "revealed" || row.disputed_at || !row.revealed_at || !row.trade_happened) return false;
  return now.getTime() - new Date(row.revealed_at).getTime() <= R.disputeDays * DAY_MS;
}

async function loadRoomMessages(
  sb: Sb,
  chat: { community_messenger_room_id: string | null; id: string },
  sellerId: string,
  buyerId: string
): Promise<{ sender_id: string; created_at: string }[]> {
  if (chat.community_messenger_room_id) {
    const { data, error } = await sb
      .from("community_messenger_messages")
      .select("sender_id, created_at, message_type")
      .eq("room_id", chat.community_messenger_room_id)
      .in("sender_id", [sellerId, buyerId])
      .is("deleted_at", null)
      .is("deleted_for_everyone_at", null)
      .neq("message_type", "system")
      .order("created_at", { ascending: true })
      .limit(2000);
    if (error) throw new Error(error.message);
    return (data ?? []) as { sender_id: string; created_at: string }[];
  }
  const { data, error } = await sb
    .from("product_chat_messages")
    .select("sender_id, created_at, message_type, is_hidden")
    .eq("product_chat_id", chat.id)
    .in("sender_id", [sellerId, buyerId])
    .neq("message_type", "system")
    .order("created_at", { ascending: true })
    .limit(2000);
  if (error) throw new Error(error.message);
  return ((data ?? []) as { sender_id: string; created_at: string; is_hidden: boolean | null }[]).filter((m) => !m.is_hidden);
}

export type TradeRatingContext = {
  chat: { id: string; post_id: string; seller_id: string; buyer_id: string };
  facts: TradeRatingFacts;
  eligibility: TradeRatingEligibility;
  mine: TradeRatingRow | null;
  theirs: TradeRatingRow | null;
};

/** 방·보는 사람 기준 자격·내 평가·상대 평가를 모은다. 방이 없거나 참여자가 아니면 null. */
export async function loadTradeRatingContext(
  sb: Sb,
  productChatId: string,
  viewerId: string,
  now: Date = new Date()
): Promise<TradeRatingContext | null> {
  const { data: chatRow, error } = await sb
    .from("product_chats")
    .select("id, post_id, seller_id, buyer_id, community_messenger_room_id")
    .eq("id", productChatId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const chat = chatRow as {
    id: string;
    post_id: string;
    seller_id: string;
    buyer_id: string;
    community_messenger_room_id: string | null;
  } | null;
  if (!chat || (chat.seller_id !== viewerId && chat.buyer_id !== viewerId)) return null;
  const counterpartId = chat.seller_id === viewerId ? chat.buyer_id : chat.seller_id;

  const [messages, post, reviews, devices, blocks, profiles, sanctions] = await Promise.all([
    loadRoomMessages(sb, chat, chat.seller_id, chat.buyer_id),
    sb.from("posts").select("sold_at").eq("id", chat.post_id).maybeSingle(),
    sb.from("transaction_reviews").select(TRADE_RATING_SELECT).eq("room_id", chat.id),
    sb.from("user_devices").select("user_id, device_id").in("user_id", [chat.seller_id, chat.buyer_id]),
    sb
      .from("user_blocks")
      .select("user_id, blocked_user_id")
      .in("user_id", [chat.seller_id, chat.buyer_id])
      .in("blocked_user_id", [chat.seller_id, chat.buyer_id])
      .is("released_at", null),
    sb.from("profiles").select("id, deleted_at").in("id", [chat.seller_id, chat.buyer_id]),
    sb
      .from("sanctions")
      .select("user_id, sanction_type, start_at, end_at")
      .in("user_id", [chat.seller_id, chat.buyer_id])
      .is("revoked_at", null),
  ]);

  const rows = ((reviews.data ?? []) as TradeRatingRow[]) ?? [];
  const mine = rows.find((r) => r.reviewer_id === viewerId) ?? null;
  const theirs = rows.find((r) => r.reviewer_id === counterpartId) ?? null;

  const devSeller = new Set<string>();
  const devBuyer = new Set<string>();
  for (const d of (devices.data ?? []) as { user_id: string; device_id: string | null }[]) {
    if (!d.device_id) continue;
    (d.user_id === chat.seller_id ? devSeller : devBuyer).add(d.device_id);
  }
  const sharedDevice = [...devSeller].some((d) => devBuyer.has(d));
  const blocked = ((blocks.data ?? []) as unknown[]).length > 0;
  const nowMs = now.getTime();
  const deleted = ((profiles.data ?? []) as { deleted_at: string | null }[]).some((p) => p.deleted_at);
  const missing = ((profiles.data ?? []) as unknown[]).length < 2;
  const suspended = ((sanctions.data ?? []) as { sanction_type: string; start_at: string | null; end_at: string | null }[]).some(
    (s) =>
      crewRepSanctionEventType(s.sanction_type) === "sanction_suspension" &&
      (!s.start_at || new Date(s.start_at).getTime() <= nowMs) &&
      (!s.end_at || new Date(s.end_at).getTime() > nowMs)
  );

  const facts: TradeRatingFacts = {
    sellerId: chat.seller_id,
    buyerId: chat.buyer_id,
    viewerId,
    messages,
    soldAt: ((post.data ?? null) as { sold_at: string | null } | null)?.sold_at ?? null,
    myReviewId: mine?.id ?? null,
    sharedDevice,
    blocked,
    accountUnavailable: deleted || missing || suspended,
  };
  return {
    chat,
    facts,
    eligibility: evaluateTradeRatingEligibility(facts, now),
    mine,
    theirs,
  };
}

/** 제출 → pending_reveal. 상대가 이미 냈으면 둘 다 바로 공개. */
export async function submitTradeRating(
  sb: Sb,
  input: { productChatId: string; viewerId: string; body: Record<string, unknown>; now?: Date }
): Promise<{ ok: true; reviewId: string; revealed: boolean } | { ok: false; error: string; status: number }> {
  const now = input.now ?? new Date();
  const ctx = await loadTradeRatingContext(sb, input.productChatId, input.viewerId, now);
  if (!ctx) return { ok: false, error: "not_participant", status: 403 };
  if (!ctx.eligibility.eligible || !ctx.eligibility.role || !ctx.eligibility.counterpartId) {
    return { ok: false, error: ctx.eligibility.reasons[0] ?? "not_eligible", status: 409 };
  }
  const v = validateTradeRatingInput(ctx.eligibility.role, input.body);
  if (!v.ok) return { ok: false, error: v.error, status: 400 };

  const nowIso = now.toISOString();
  const { data, error } = await sb
    .from("transaction_reviews")
    .insert({
      product_id: ctx.chat.post_id,
      room_id: ctx.chat.id,
      reviewer_id: input.viewerId,
      reviewee_id: ctx.eligibility.counterpartId,
      role_type: ctx.eligibility.role,
      public_review_type: v.ratingType,
      positive_tag_keys: v.ratingType === "bad" ? [] : v.tags,
      negative_tag_keys: v.ratingType === "bad" ? v.tags : [],
      review_comment: v.comment,
      trade_happened: v.tradeHappened,
      rating_status: "pending_reveal",
      revealed_at: null,
      is_anonymous_negative: false,
    } as never)
    .select("id")
    .maybeSingle();
  if (error) {
    if ((error as { code?: string }).code === "23505") return { ok: false, error: "already_rated", status: 409 };
    return { ok: false, error: "save_failed", status: 500 };
  }
  const reviewId = (data as { id: string } | null)?.id;
  if (!reviewId) return { ok: false, error: "save_failed", status: 500 };

  let revealed = false;
  if (ctx.theirs && ctx.theirs.rating_status === "pending_reveal") {
    const { error: upErr } = await sb
      .from("transaction_reviews")
      .update({ rating_status: "revealed", revealed_at: nowIso } as never)
      .in("id", [reviewId, ctx.theirs.id])
      .eq("rating_status", "pending_reveal");
    if (upErr) return { ok: false, error: "reveal_failed", status: 500 };
    revealed = true;
  }
  return { ok: true, reviewId, revealed };
}

/** 첫 제출 후 7일 지난 미공개 평가 공개 (예약 작업). */
export async function revealDueTradeRatings(sb: Sb, now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - R.revealAfterDays * DAY_MS).toISOString();
  const { data, error } = await sb
    .from("transaction_reviews")
    .update({ rating_status: "revealed", revealed_at: now.toISOString() } as never)
    .eq("rating_status", "pending_reveal")
    .lte("created_at", cutoff)
    .select("id");
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown[]).length;
}

/** 받은 아쉬워요 이의제기 (공개 후 14일 안 1회). */
export async function disputeTradeRating(
  sb: Sb,
  input: { reviewId: string; viewerId: string; reason: string; note?: string | null; now?: Date }
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const now = input.now ?? new Date();
  const reason = input.reason.trim();
  if (reason.length < 2 || reason.length > 200) return { ok: false, error: "reason_required", status: 400 };
  const { data, error } = await sb.from("transaction_reviews").select(TRADE_RATING_SELECT).eq("id", input.reviewId).maybeSingle();
  if (error) return { ok: false, error: "load_failed", status: 500 };
  const row = data as TradeRatingRow | null;
  if (!row || row.reviewee_id !== input.viewerId) return { ok: false, error: "not_found", status: 404 };
  if (!canDisputeTradeRating(row, input.viewerId, now)) return { ok: false, error: "dispute_not_allowed", status: 409 };
  const { error: upErr } = await sb
    .from("transaction_reviews")
    .update({
      rating_status: "disputed",
      disputed_at: now.toISOString(),
      dispute_reason: reason,
      dispute_note: (input.note ?? "").trim().slice(0, 500) || null,
    } as never)
    .eq("id", row.id)
    .eq("rating_status", "revealed")
    .is("disputed_at", null);
  if (upErr) return { ok: false, error: "save_failed", status: 500 };
  return { ok: true };
}

/** 운영자 이의 결정: 인정 → reversed(점수 0) · 기각 → revealed(반영). */
export async function decideTradeRatingDispute(
  sb: Sb,
  input: { reviewId: string; adminId: string; decision: "accepted" | "rejected"; note: string; now?: Date }
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const now = input.now ?? new Date();
  const { data, error } = await sb
    .from("transaction_reviews")
    .update({
      rating_status: input.decision === "accepted" ? "reversed" : "revealed",
      dispute_decision: input.decision,
      dispute_decided_at: now.toISOString(),
      dispute_decided_by: input.adminId,
      admin_note: input.note.slice(0, 1000),
    } as never)
    .eq("id", input.reviewId)
    .eq("rating_status", "disputed")
    .select("id");
  if (error) return { ok: false, error: "save_failed", status: 500 };
  if (((data ?? []) as unknown[]).length === 0) return { ok: false, error: "not_disputed", status: 409 };
  return { ok: true };
}

export type TradeRatingSummary = {
  total: number;
  raters: number;
  good: number;
  normal: number;
  bad: number;
  last90d: number;
  topBadTags: string[];
  confirmedTradeReports: number;
};

/** 구매자가 판매자를 볼 때 쓰는 공개 집계 (최근 365일, 공개된 평가만, 평가자·날짜 비공개). */
export async function loadTradeRatingSummary(sb: Sb, memberId: string, now: Date = new Date()): Promise<TradeRatingSummary> {
  const since = new Date(now.getTime() - 365 * DAY_MS).toISOString();
  const [rev, fraud] = await Promise.all([
    sb
      .from("transaction_reviews")
      .select("reviewer_id, public_review_type, negative_tag_keys, rating_status, is_hidden_by_admin, revealed_at, created_at")
      .eq("reviewee_id", memberId)
      .eq("rating_status", "revealed")
      .gte("created_at", since),
    sb
      .from("trust_events")
      .select("id", { count: "exact", head: true })
      .eq("member_id", memberId)
      .eq("event_type", "trade_fraud_confirmed")
      .eq("status", "confirmed"),
  ]);
  if (rev.error) throw new Error(rev.error.message);
  const rows = ((rev.data ?? []) as {
    reviewer_id: string;
    public_review_type: string;
    negative_tag_keys: string[] | null;
    is_hidden_by_admin: boolean | null;
    revealed_at: string | null;
    created_at: string;
  }[]).filter((r) => !r.is_hidden_by_admin);
  const tagCount = new Map<string, number>();
  for (const r of rows) {
    if (r.public_review_type !== "bad") continue;
    for (const k of r.negative_tag_keys ?? []) tagCount.set(k, (tagCount.get(k) ?? 0) + 1);
  }
  const d90 = now.getTime() - 90 * DAY_MS;
  return {
    total: rows.length,
    raters: new Set(rows.map((r) => r.reviewer_id)).size,
    good: rows.filter((r) => r.public_review_type === "good").length,
    normal: rows.filter((r) => r.public_review_type === "normal").length,
    bad: rows.filter((r) => r.public_review_type === "bad").length,
    last90d: rows.filter((r) => new Date(r.revealed_at ?? r.created_at).getTime() >= d90).length,
    topBadTags: [...tagCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => k),
    confirmedTradeReports: fraud.count ?? 0,
  };
}
