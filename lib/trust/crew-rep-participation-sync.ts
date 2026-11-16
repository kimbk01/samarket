/**
 * CREW REP 참여도(P) 사건 동기화기 — S3 (Owner 2026-11-16 「S3 진행해」).
 *
 * 글 72시간·댓글 24시간 유지 같은 조건은 작성 순간에 판정할 수 없으므로, 매일 원천 표를 읽어
 * 「지금 인정되어야 하는 사건」 집합을 만들고 원장과 맞춘다.
 *   - 인정인데 원장에 없음 → 기록 (멱등 키)
 *   - 원장에 confirmed 인데 더는 인정 안 됨(숨김·삭제·좋아요 취소·후기 숨김) → reversed
 *   - reversed(이 동기화기가 되돌린 것)인데 다시 인정(숨김 해제) → confirmed
 * 원장은 지우지 않는다. 기록 시작 이전 데이터는 대상이 아니다(CREW_REP_PARTICIPATION_START_ISO).
 *
 * 원천: 라운지 `community_posts`(직접 쓴 글 origin_kind=member)·`community_comments`·
 *       `community_post_likes`·`community_comment_likes`, 매장 `store_reviews`↔`store_orders`↔`stores`.
 * 매장 후기 별점은 매장 평점이며 CREW REP 에 넣지 않는다 — 「성실히 쓴 후기」 참여만 인정.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CREW_REP_PARTICIPATION_RULES as R,
  CREW_REP_PARTICIPATION_START_ISO,
  CREW_REP_POLICY_VERSION,
  buildCrewRepEventIdempotencyKey,
} from "@/lib/trust/crew-rep-policy";

type Sb = SupabaseClient<any>;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export const PARTICIPATION_EVENT_TYPES = [
  "participation_post",
  "participation_comment_received",
  "participation_comment_written",
  "participation_like_received",
  "participation_store_review",
] as const;
export type ParticipationEventType = (typeof PARTICIPATION_EVENT_TYPES)[number];

const SYNC_REVERSE_REASON = "participation_source_invalid";

export type LoungePost = {
  id: string;
  user_id: string;
  created_at: string;
  status: string | null;
  is_hidden: boolean | null;
  is_deleted: boolean | null;
  is_sample_data: boolean | null;
  is_notice: boolean | null;
  origin_kind: string | null;
};
export type LoungeComment = {
  id: string;
  post_id: string;
  user_id: string;
  content: string | null;
  created_at: string;
  status: string | null;
  is_hidden: boolean | null;
  is_deleted: boolean | null;
};
export type LoungeLike = { id: string; target_id: string; user_id: string; created_at: string; kind: "post" | "comment" };
export type StoreReviewSource = {
  id: string;
  buyer_user_id: string;
  content: string | null;
  image_urls: string[] | null;
  status: string | null;
  created_at: string;
  order_buyer_user_id: string | null;
  order_status: string | null;
  order_completed_at: string | null;
  store_owner_user_id: string | null;
};

export type ParticipationSources = {
  posts: LoungePost[];
  comments: LoungeComment[];
  likes: LoungeLike[];
  storeReviews: StoreReviewSource[];
};

export type DesiredTrustEvent = {
  member_id: string;
  domain: "community" | "delivery";
  event_type: ParticipationEventType;
  source_type: string;
  source_id: string;
  counterparty_id: string | null;
  occurred_at: string;
  idempotency_key: string;
  metadata: Record<string, unknown>;
};

function postEligible(p: LoungePost | undefined): p is LoungePost {
  return Boolean(
    p &&
      p.origin_kind === "member" &&
      (p.status ?? "active") === "active" &&
      !p.is_hidden &&
      !p.is_deleted &&
      !p.is_sample_data &&
      !p.is_notice
  );
}

function commentAlive(c: LoungeComment): boolean {
  return (c.status ?? "active") === "active" && !c.is_hidden && !c.is_deleted;
}

const after = (iso: string, startMs: number) => new Date(iso).getTime() >= startMs;

/** 원천 → 지금 인정되어야 하는 참여 사건 (순수 함수). */
export function planParticipationEvents(src: ParticipationSources, asOf: Date): DesiredTrustEvent[] {
  const now = asOf.getTime();
  const startMs = new Date(CREW_REP_PARTICIPATION_START_ISO).getTime();
  const postById = new Map(src.posts.map((p) => [p.id, p]));
  const commentById = new Map(src.comments.map((c) => [c.id, c]));
  const out: DesiredTrustEvent[] = [];
  const add = (e: Omit<DesiredTrustEvent, "idempotency_key">) =>
    out.push({ ...e, idempotency_key: buildCrewRepEventIdempotencyKey(e.event_type, e.source_id, e.member_id) });

  // 다른 회원 반응이 있는 글
  const reactedPosts = new Set<string>();
  for (const l of src.likes) {
    if (l.kind !== "post") continue;
    const p = postById.get(l.target_id);
    if (p && l.user_id !== p.user_id) reactedPosts.add(p.id);
  }
  for (const c of src.comments) {
    const p = postById.get(c.post_id);
    if (p && c.user_id !== p.user_id && commentAlive(c)) reactedPosts.add(p.id);
  }

  // 1) 라운지 글
  for (const p of src.posts) {
    if (!postEligible(p) || !after(p.created_at, startMs)) continue;
    if (now - new Date(p.created_at).getTime() < R.postHoldHours * HOUR_MS) continue;
    if (!reactedPosts.has(p.id)) continue;
    add({
      member_id: p.user_id,
      domain: "community",
      event_type: "participation_post",
      source_type: "community_post",
      source_id: p.id,
      counterparty_id: null,
      occurred_at: p.created_at,
      metadata: { target_id: p.id },
    });
  }

  // 2) 댓글 — 쓴 사람(작성) · 글 주인(받음)
  for (const c of src.comments) {
    if (!after(c.created_at, startMs) || !commentAlive(c)) continue;
    const p = postById.get(c.post_id);
    if (!postEligible(p) || c.user_id === p.user_id) continue;
    if ((c.content ?? "").trim().length < R.commentMinChars) continue;
    if (now - new Date(c.created_at).getTime() < R.commentHoldHours * HOUR_MS) continue;
    add({
      member_id: c.user_id,
      domain: "community",
      event_type: "participation_comment_written",
      source_type: "community_comment",
      source_id: c.id,
      counterparty_id: p.user_id,
      occurred_at: c.created_at,
      metadata: { target_id: p.id },
    });
    add({
      member_id: p.user_id,
      domain: "community",
      event_type: "participation_comment_received",
      source_type: "community_comment",
      source_id: c.id,
      counterparty_id: c.user_id,
      occurred_at: c.created_at,
      metadata: { target_id: p.id },
    });
  }

  // 3) 받은 좋아요 — 글·댓글, 자기 좋아요 제외
  for (const l of src.likes) {
    if (!after(l.created_at, startMs)) continue;
    let ownerId: string | null = null;
    if (l.kind === "post") {
      const p = postById.get(l.target_id);
      if (!postEligible(p)) continue;
      ownerId = p.user_id;
    } else {
      const c = commentById.get(l.target_id);
      if (!c || !commentAlive(c)) continue;
      if (!postEligible(postById.get(c.post_id))) continue;
      ownerId = c.user_id;
    }
    if (!ownerId || ownerId === l.user_id) continue;
    add({
      member_id: ownerId,
      domain: "community",
      event_type: "participation_like_received",
      source_type: l.kind === "post" ? "community_post_like" : "community_comment_like",
      source_id: l.id,
      counterparty_id: l.user_id,
      occurred_at: l.created_at,
      metadata: { target_id: l.target_id, target_kind: l.kind },
    });
  }

  // 4) 주문 후 매장 후기
  for (const r of src.storeReviews) {
    if (!after(r.created_at, startMs) || r.status !== "visible") continue;
    if (r.order_status !== "completed" || !r.order_completed_at) continue;
    if (!r.order_buyer_user_id || r.order_buyer_user_id !== r.buyer_user_id) continue;
    if (r.store_owner_user_id && r.store_owner_user_id === r.buyer_user_id) continue;
    const written = new Date(r.created_at).getTime() - new Date(r.order_completed_at).getTime();
    if (written > R.storeReviewMaxDaysAfterComplete * DAY_MS) continue;
    const hasPhoto = Array.isArray(r.image_urls) && r.image_urls.some((u) => typeof u === "string" && u.trim());
    if (!hasPhoto && (r.content ?? "").trim().length < R.storeReviewMinChars) continue;
    add({
      member_id: r.buyer_user_id,
      domain: "delivery",
      event_type: "participation_store_review",
      source_type: "store_review",
      source_id: r.id,
      counterparty_id: null,
      occurred_at: r.created_at,
      metadata: { target_id: r.id },
    });
  }

  return out;
}

export type ExistingParticipationEvent = {
  id: string;
  member_id: string;
  idempotency_key: string;
  status: string;
  metadata: Record<string, unknown> | null;
};

export type ParticipationDiff = {
  insert: DesiredTrustEvent[];
  reverse: ExistingParticipationEvent[];
  reconfirm: ExistingParticipationEvent[];
};

/** 원하는 집합 ↔ 원장 비교 (순수 함수). 다른 사유로 되돌린 사건은 다시 살리지 않는다. */
export function diffParticipationEvents(
  desired: DesiredTrustEvent[],
  existing: ExistingParticipationEvent[]
): ParticipationDiff {
  const want = new Map(desired.map((d) => [d.idempotency_key, d]));
  const have = new Map(existing.map((e) => [e.idempotency_key, e]));
  const insert = desired.filter((d) => !have.has(d.idempotency_key));
  const reverse = existing.filter((e) => e.status === "confirmed" && !want.has(e.idempotency_key));
  const reconfirm = existing.filter(
    (e) =>
      e.status === "reversed" &&
      want.has(e.idempotency_key) &&
      (e.metadata as { reverse_reason?: unknown } | null)?.reverse_reason === SYNC_REVERSE_REASON
  );
  return { insert, reverse, reconfirm };
}

async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const page = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await build(from, from + page - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < page) break;
  }
  return out;
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/** 원천 표 읽기 — 기록 시작 이후 만들어진 것 + 그것이 가리키는 글·댓글. */
export async function loadParticipationSources(sb: Sb): Promise<ParticipationSources> {
  const start = CREW_REP_PARTICIPATION_START_ISO;
  const postCols = "id, user_id, created_at, status, is_hidden, is_deleted, is_sample_data, is_notice, origin_kind";
  const commentCols = "id, post_id, user_id, content, created_at, status, is_hidden, is_deleted";

  const [newPosts, newComments, postLikes, commentLikes, reviews] = await Promise.all([
    fetchAll<LoungePost>((a, b) => sb.from("community_posts").select(postCols).gte("created_at", start).order("id").range(a, b)),
    fetchAll<LoungeComment>((a, b) =>
      sb.from("community_comments").select(commentCols).gte("created_at", start).order("id").range(a, b)
    ),
    fetchAll<{ id: string; post_id: string; user_id: string; created_at: string }>((a, b) =>
      sb.from("community_post_likes").select("id, post_id, user_id, created_at").gte("created_at", start).order("id").range(a, b)
    ),
    fetchAll<{ id: string; comment_id: string; user_id: string; created_at: string }>((a, b) =>
      sb.from("community_comment_likes").select("id, comment_id, user_id, created_at").gte("created_at", start).order("id").range(a, b)
    ),
    fetchAll<{
      id: string;
      order_id: string;
      store_id: string;
      buyer_user_id: string;
      content: string | null;
      image_urls: string[] | null;
      status: string | null;
      created_at: string;
    }>((a, b) =>
      sb
        .from("store_reviews")
        .select("id, order_id, store_id, buyer_user_id, content, image_urls, status, created_at")
        .gte("created_at", start)
        .order("id")
        .range(a, b)
    ),
  ]);

  // 좋아요가 가리키는 댓글, 댓글·좋아요가 가리키는 글 (기록 시작 이전 글 포함)
  const commentMap = new Map(newComments.map((c) => [c.id, c]));
  const missingCommentIds = [...new Set(commentLikes.map((l) => l.comment_id))].filter((id) => !commentMap.has(id));
  for (const ids of chunk(missingCommentIds, 200)) {
    const { data, error } = await sb.from("community_comments").select(commentCols).in("id", ids);
    if (error) throw new Error(error.message);
    for (const c of (data ?? []) as LoungeComment[]) commentMap.set(c.id, c);
  }
  const postMap = new Map(newPosts.map((p) => [p.id, p]));
  const neededPostIds = new Set<string>([
    ...[...commentMap.values()].map((c) => c.post_id),
    ...postLikes.map((l) => l.post_id),
  ]);
  const missingPostIds = [...neededPostIds].filter((id) => !postMap.has(id));
  for (const ids of chunk(missingPostIds, 200)) {
    const { data, error } = await sb.from("community_posts").select(postCols).in("id", ids);
    if (error) throw new Error(error.message);
    for (const p of (data ?? []) as LoungePost[]) postMap.set(p.id, p);
  }
  // 새 글의 반응 판정용 — 시작 이전에 달린 좋아요·댓글은 없으므로 새 것만으로 충분

  // 매장 후기 ↔ 주문 ↔ 매장
  const orderIds = [...new Set(reviews.map((r) => r.order_id))];
  const storeIds = [...new Set(reviews.map((r) => r.store_id))];
  const orderMap = new Map<string, { buyer_user_id: string | null; order_status: string | null; completed_at: string | null }>();
  for (const ids of chunk(orderIds, 200)) {
    const { data, error } = await sb.from("store_orders").select("id, buyer_user_id, order_status, completed_at").in("id", ids);
    if (error) throw new Error(error.message);
    for (const o of (data ?? []) as { id: string; buyer_user_id: string | null; order_status: string | null; completed_at: string | null }[]) {
      orderMap.set(o.id, o);
    }
  }
  const ownerMap = new Map<string, string | null>();
  for (const ids of chunk(storeIds, 200)) {
    const { data, error } = await sb.from("stores").select("id, owner_user_id").in("id", ids);
    if (error) throw new Error(error.message);
    for (const s of (data ?? []) as { id: string; owner_user_id: string | null }[]) ownerMap.set(s.id, s.owner_user_id);
  }

  return {
    posts: [...postMap.values()],
    comments: [...commentMap.values()],
    likes: [
      ...postLikes.map((l) => ({ id: l.id, target_id: l.post_id, user_id: l.user_id, created_at: l.created_at, kind: "post" as const })),
      ...commentLikes.map((l) => ({
        id: l.id,
        target_id: l.comment_id,
        user_id: l.user_id,
        created_at: l.created_at,
        kind: "comment" as const,
      })),
    ],
    storeReviews: reviews.map((r) => {
      const o = orderMap.get(r.order_id);
      return {
        id: r.id,
        buyer_user_id: r.buyer_user_id,
        content: r.content,
        image_urls: r.image_urls,
        status: r.status,
        created_at: r.created_at,
        order_buyer_user_id: o?.buyer_user_id ?? null,
        order_status: o?.order_status ?? null,
        order_completed_at: o?.completed_at ?? null,
        store_owner_user_id: ownerMap.get(r.store_id) ?? null,
      };
    }),
  };
}

export type ParticipationSyncResult = {
  desired: number;
  inserted: number;
  reversed: number;
  reconfirmed: number;
  /** 원장이 바뀐 회원 (재계산 대상) */
  touchedMemberIds: string[];
  byType: Record<string, number>;
};

/** 원천 ↔ 원장 동기화. dryRun 이면 쓰지 않고 차이만 센다. 재계산은 호출자가 한다. */
export async function syncParticipationTrustEvents(
  sb: Sb,
  opts: { asOf?: Date; dryRun?: boolean } = {}
): Promise<ParticipationSyncResult> {
  const asOf = opts.asOf ?? new Date();
  const sources = await loadParticipationSources(sb);
  const desired = planParticipationEvents(sources, asOf);
  const existing = await fetchAll<ExistingParticipationEvent>((a, b) =>
    sb
      .from("trust_events")
      .select("id, member_id, idempotency_key, status, metadata")
      .in("event_type", [...PARTICIPATION_EVENT_TYPES])
      .order("id")
      .range(a, b)
  );
  const diff = diffParticipationEvents(desired, existing);
  const byType: Record<string, number> = {};
  for (const d of desired) byType[d.event_type] = (byType[d.event_type] ?? 0) + 1;
  const touched = new Set<string>([
    ...diff.insert.map((d) => d.member_id),
    ...diff.reverse.map((e) => e.member_id),
    ...diff.reconfirm.map((e) => e.member_id),
  ]);

  if (!opts.dryRun) {
    const nowIso = asOf.toISOString();
    for (const rows of chunk(diff.insert, 200)) {
      const { error } = await sb.from("trust_events").upsert(
        rows.map((d) => ({
          ...d,
          direction: "positive",
          severity: "none",
          status: "confirmed",
          confirmed_at: nowIso,
          policy_version: CREW_REP_POLICY_VERSION,
        })) as never,
        { onConflict: "idempotency_key", ignoreDuplicates: true }
      );
      if (error) throw new Error(error.message);
    }
    for (const e of diff.reverse) {
      const { error } = await sb
        .from("trust_events")
        .update({
          status: "reversed",
          metadata: { ...(e.metadata ?? {}), reversed_at: nowIso, reverse_reason: SYNC_REVERSE_REASON },
        } as never)
        .eq("id", e.id)
        .eq("status", "confirmed");
      if (error) throw new Error(error.message);
    }
    for (const e of diff.reconfirm) {
      const { error } = await sb
        .from("trust_events")
        .update({
          status: "confirmed",
          metadata: { ...(e.metadata ?? {}), reconfirmed_at: nowIso, reverse_reason: null },
        } as never)
        .eq("id", e.id)
        .eq("status", "reversed");
      if (error) throw new Error(error.message);
    }
  }

  return {
    desired: desired.length,
    inserted: diff.insert.length,
    reversed: diff.reverse.length,
    reconfirmed: diff.reconfirm.length,
    touchedMemberIds: [...touched].sort(),
    byType,
  };
}
