/**
 * 관리자 거래 후기 목록 (서버) — `/api/admin/transaction-reviews` 목록 조회 (R7 목록 표준).
 * - DB 에서 필터·정렬·페이지(`range`) + `count: "exact"` — 예전 `.limit(500)` 후 클라이언트 필터 방식 제거.
 * - 필터 의미는 예전 화면 필터(`filterAndSortReviews` + `mapTransactionReviewRowToAdminReview`)와 같다:
 *   · 상태: 운영 DB 에 `is_hidden_by_admin` 컬럼이 없어 모든 후기가 「노출」 → `hidden`·`reported` 는 0건.
 *   · 별점: good=5 · bad=1 · 그 외(normal·알 수 없는 값)=3 → 2·4 는 0건.
 *   · 역할: seller_to_buyer 외의 값은 buyer_to_seller 로 본다.
 *   · 검색어: 후기 내용 · 거래글 제목 · 작성자/대상 닉네임(표시명·아이디) · 거래 채팅 번호(전체 일치).
 *     제목·닉네임은 일치하는 글·회원 id 를 먼저 찾아(각 최대 SEARCH_ID_CAP) `in` 조건으로 건다.
 */
import { POSTS_TABLE_READ } from "@/lib/posts/posts-db-tables";
import { POST_TRADE_RELATION_SELECT } from "@/lib/posts/post-query-select";
import { batchNicknamesByUserIds, batchUserIdentityByUserIds } from "@/lib/admin-reviews/batch-nicknames-server";
import {
  mapTransactionReviewRowToAdminReview,
  type TransactionReviewDbRow,
} from "@/lib/admin-reviews/map-transaction-review-to-admin";
import { escapeAdminIlike, sanitizeAdminListSearch } from "@/lib/admin/pagination/parse-admin-list-page";
import { parseTradeAdminListPage } from "@/lib/admin/trade-admin/trade-admin-list-page";
import type { AdminReview } from "@/lib/types/admin-review";

export const ADMIN_TRANSACTION_REVIEW_SELECT_FIELDS =
  "id, product_id, room_id, reviewer_id, reviewee_id, role_type, public_review_type, private_manner_score, private_tags, is_anonymous_negative, created_at, positive_tag_keys, negative_tag_keys, review_comment";
// Production has no transaction_reviews.is_hidden_by_admin — omit from SELECT.

/** 검색어 → 거래글·회원 id 미리 찾기 상한 (검색 조건 해석용 — 목록 상한 아님) */
export const ADMIN_REVIEW_SEARCH_ID_CAP = 200;

export type AdminTransactionReviewsListParams = {
  limit: number;
  offset: number;
  q: string;
  status: "" | "visible" | "hidden" | "reported";
  rating: "" | 1 | 2 | 3 | 4 | 5;
  role: "" | "buyer_to_seller" | "seller_to_buyer";
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseAdminTransactionReviewsListParams(sp: URLSearchParams): AdminTransactionReviewsListParams {
  const { limit, offset } = parseTradeAdminListPage(sp);
  const st = String(sp.get("status") ?? "").trim();
  const status = st === "visible" || st === "hidden" || st === "reported" ? st : "";
  const r = Number(String(sp.get("rating") ?? "").trim());
  const rating = ([1, 2, 3, 4, 5] as const).find((n) => n === r) ?? "";
  const ro = String(sp.get("role") ?? "").trim();
  const role = ro === "buyer_to_seller" || ro === "seller_to_buyer" ? ro : "";
  return { limit, offset, q: sanitizeAdminListSearch(sp.get("q")), status, rating, role };
}

/* eslint-disable @typescript-eslint/no-explicit-any -- 관리자 API 공용 클라이언트(서비스 롤/anon)의 제네릭 스키마 차이 */
export async function listAdminTransactionReviewRows(
  sbAny: any,
  p: AdminTransactionReviewsListParams
): Promise<{ ok: true; rows: TransactionReviewDbRow[]; total: number } | { ok: false; error: string }> {
  // 운영 DB 에 숨김 컬럼이 없어 모든 후기가 「노출」 상태 (예전 화면과 같은 결과)
  if (p.status === "hidden" || p.status === "reported") return { ok: true, rows: [], total: 0 };
  if (p.rating === 2 || p.rating === 4) return { ok: true, rows: [], total: 0 };

  let query = sbAny.from("transaction_reviews").select(ADMIN_TRANSACTION_REVIEW_SELECT_FIELDS, { count: "exact" });
  if (p.rating === 5) query = query.eq("public_review_type", "good");
  else if (p.rating === 1) query = query.eq("public_review_type", "bad");
  else if (p.rating === 3) query = query.or("public_review_type.is.null,public_review_type.not.in.(good,bad)");
  if (p.role === "seller_to_buyer") query = query.eq("role_type", "seller_to_buyer");
  else if (p.role === "buyer_to_seller") query = query.or("role_type.is.null,role_type.neq.seller_to_buyer");

  if (p.q) {
    const like = `%${escapeAdminIlike(p.q)}%`;
    const [posts, people] = await Promise.all([
      sbAny.from(POSTS_TABLE_READ).select("id").ilike("title", like).limit(ADMIN_REVIEW_SEARCH_ID_CAP),
      sbAny
        .from("profiles")
        .select("id")
        .or(`nickname.ilike.${like},display_name.ilike.${like},username.ilike.${like}`)
        .limit(ADMIN_REVIEW_SEARCH_ID_CAP),
    ]);
    if (posts.error) return { ok: false, error: String(posts.error.message ?? "posts_search_failed") };
    if (people.error) return { ok: false, error: String(people.error.message ?? "profiles_search_failed") };
    const postIds = ((posts.data ?? []) as { id: unknown }[]).map((x) => String(x.id)).filter(Boolean);
    const userIds = ((people.data ?? []) as { id: unknown }[]).map((x) => String(x.id)).filter(Boolean);
    const ors = [`review_comment.ilike.${like}`];
    if (postIds.length) ors.push(`product_id.in.(${postIds.join(",")})`);
    if (userIds.length) ors.push(`reviewer_id.in.(${userIds.join(",")})`, `reviewee_id.in.(${userIds.join(",")})`);
    if (UUID_RE.test(p.q)) ors.push(`room_id.eq.${p.q}`);
    query = query.or(ors.join(","));
  }

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(p.offset, p.offset + p.limit - 1);
  if (error) return { ok: false, error: String(error.message ?? "list_failed") };
  const rows = (data ?? []) as TransactionReviewDbRow[];
  return { ok: true, rows, total: typeof count === "number" ? count : rows.length };
}

/** 목록 행 → 화면용 후기 (거래글 제목·닉네임·아이디 보강) — 한 페이지 분만 */
export async function enrichAdminTransactionReviews(sbAny: any, list: TransactionReviewDbRow[]): Promise<AdminReview[]> {
  const productIds = [...new Set(list.map((x) => x.product_id).filter(Boolean))];
  const userIds = [...new Set(list.flatMap((x) => [x.reviewer_id, x.reviewee_id]).filter(Boolean))];

  const postById = new Map<string, Record<string, unknown>>();
  if (productIds.length) {
    const { data: posts } = await sbAny.from(POSTS_TABLE_READ).select(POST_TRADE_RELATION_SELECT).in("id", productIds);
    (posts ?? []).forEach((row: Record<string, unknown>) => {
      const id = String(row.id ?? "");
      if (id) postById.set(id, row);
    });
    const missing = productIds.filter((id) => !postById.has(id));
    for (const mid of missing) {
      const { data: one } = await sbAny.from(POSTS_TABLE_READ).select(POST_TRADE_RELATION_SELECT).eq("id", mid).maybeSingle();
      if (one) postById.set(String(mid), one as Record<string, unknown>);
    }
  }

  const nicknameById = await batchNicknamesByUserIds(sbAny, userIds);
  const identityById = await batchUserIdentityByUserIds(sbAny, userIds);
  const reviews = list.map((r) => mapTransactionReviewRowToAdminReview(r, postById.get(r.product_id), nicknameById));
  reviews.forEach((review) => {
    review.reviewerUsername = identityById[review.reviewerId]?.username ?? null;
    review.reviewerDisplayName = identityById[review.reviewerId]?.displayName ?? null;
    review.targetUsername = identityById[review.targetUserId]?.username ?? null;
    review.targetDisplayName = identityById[review.targetUserId]?.displayName ?? null;
    const role = review.role;
    const sellerId = role === "seller_to_buyer" ? review.reviewerId : review.targetUserId;
    const buyerId = role === "buyer_to_seller" ? review.reviewerId : review.targetUserId;
    review.sellerUsername = identityById[sellerId]?.username ?? null;
    review.buyerUsername = identityById[buyerId]?.username ?? null;
  });
  return reviews;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
