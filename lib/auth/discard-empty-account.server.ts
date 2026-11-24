/**
 * 실수로 만든 빈 계정 정리 (설계 `docs/audit/registration-action-cta-ssot-design-2026-11-21.md` §5-6,
 * 재감사3 #1 강화 2026-11-21).
 *
 * 장면: 카카오로 가입한 사람이 구글·애플로 로그인해 새 계정이 생김 → 전화 단계에서 「이 번호로 가입된 계정이 있어요」.
 * 그 로그인 방법이 새 계정에 묶여 원래 계정에 연결할 수 없다(탈퇴로도 안 풀림). 빈 계정이면 회원이 스스로 지운다.
 *
 * 지우는 조건 — **모두** 맞을 때만 (하나라도 아니면 지우지 않고 고객센터 안내):
 * 1. 회원이 방금 시도한 번호가 **다른 계정에 실제로 등록**돼 있다(서버가 다시 확인) — 번호 중복 상황에서만
 * 2. 가입한 지 **7일 이내**
 * 3. 특권 관리자·관리자 멤버십(상태 무관)·관리자 생성 계정 아님, 전화 인증 안 됨
 * 4. 회원과 연결된 활동 표 **전부 0건** — 운영 DB 의 회원 열(user_id 등) 표를 2026-11-21 전수 조회해 만든 목록.
 *    표 하나라도 조회에 실패하면 지우지 않는다(통과로 간주하지 않음).
 * 5. 영구 삭제를 막는 연결(`admin_can_purge_auth_user`) 없음
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { hasVerifiedPhone } from "@/lib/auth/post-login-profile-policy";
import { fetchAuthUserPurgeBlockers } from "@/lib/admin/admin-user-deletion";
import { findPhoneDuplicateOnOtherProfile } from "@/lib/auth/phone-otp-duplicate-check";

type CountCheck = { table: string; column: string };

/** 가입 뒤 이 기간 안의 계정만 (실수로 막 만든 계정) */
export const EMPTY_ACCOUNT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * 활동 표 — 하나라도 행이 있으면 빈 계정이 아니다. 운영 DB `information_schema` 회원 열 전수(2026-11-21)에서
 * 기록·계측·캐시 표(알림 기록·기기·세션·동의 기록·스냅샷·멱등 키·OTP·설정)를 뺀 「회원이 남긴 것」 전부.
 */
export const EMPTY_ACCOUNT_ACTIVITY_CHECKS: readonly CountCheck[] = [
  // 글·댓글
  { table: "posts", column: "user_id" },
  { table: "community_posts", column: "user_id" },
  { table: "community_comments", column: "user_id" },
  { table: "philife_posts", column: "user_id" },
  { table: "philife_comments", column: "user_id" },
  { table: "comments", column: "user_id" },
  { table: "post_comments", column: "user_id" },
  { table: "customer_center_comments", column: "user_id" },
  // 좋아요·저장·찜·관심
  { table: "community_post_likes", column: "user_id" },
  { table: "community_post_saves", column: "user_id" },
  { table: "community_likes", column: "user_id" },
  { table: "community_comment_likes", column: "user_id" },
  { table: "post_likes", column: "user_id" },
  { table: "favorites", column: "user_id" },
  { table: "product_favorites", column: "user_id" },
  { table: "dibay_favorites", column: "user_id" },
  { table: "store_favorites", column: "user_id" },
  { table: "community_friend_favorites", column: "user_id" },
  { table: "user_relationships", column: "user_id" },
  { table: "user_relationships", column: "target_user_id" },
  // 친구·메신저·통화
  { table: "community_friend_requests", column: "requester_id" },
  { table: "community_messenger_friendships", column: "requester_user_id" },
  { table: "community_messenger_friendships", column: "addressee_user_id" },
  { table: "community_messenger_participants", column: "user_id" },
  { table: "community_messenger_messages", column: "sender_id" },
  { table: "community_messenger_message_reactions", column: "user_id" },
  { table: "community_messenger_group_join_requests", column: "user_id" },
  { table: "community_messenger_room_profiles", column: "user_id" },
  { table: "community_messenger_call_logs", column: "caller_user_id" },
  { table: "community_messenger_call_session_participants", column: "user_id" },
  { table: "community_messenger_call_sessions", column: "recipient_user_id" },
  { table: "group_room_members", column: "user_id" },
  { table: "open_chat_members", column: "user_id" },
  { table: "open_chat_join_requests", column: "user_id" },
  { table: "contact_sources", column: "user_id" },
  // 거래 채팅
  { table: "product_chats", column: "buyer_id" },
  { table: "product_chats", column: "seller_id" },
  { table: "chat_rooms", column: "buyer_id" },
  { table: "chat_rooms", column: "seller_id" },
  { table: "chat_room_participants", column: "user_id" },
  { table: "chat_messages", column: "sender_id" },
  { table: "chat_requests", column: "requester_id" },
  // 모임
  { table: "moim_members", column: "user_id" },
  { table: "moim_join_requests", column: "user_id" },
  { table: "moim_schedule_participants", column: "user_id" },
  // 주문·결제·포인트·상품권·광고
  { table: "store_orders", column: "buyer_user_id" },
  { table: "store_inquiries", column: "from_user_id" },
  { table: "point_ledger", column: "user_id" },
  { table: "point_charge_requests", column: "user_id" },
  { table: "point_promotion_orders", column: "user_id" },
  { table: "apple_iap_transactions", column: "user_id" },
  { table: "gift_certificate_ledger", column: "user_id" },
  { table: "gift_certificate_transfers", column: "sender_user_id" },
  { table: "gift_certificate_transfers", column: "recipient_user_id" },
  { table: "feed_ad_requests", column: "user_id" },
  { table: "post_ads", column: "user_id" },
  { table: "trade_post_ads", column: "user_id" },
  { table: "store_ad_applications", column: "user_id" },
  { table: "ad_payment_requests", column: "user_id" },
  // 신고·고객지원·운영
  { table: "reports", column: "reporter_id" },
  { table: "community_reports", column: "user_id" },
  { table: "philife_reports", column: "user_id" },
  { table: "post_reports", column: "user_id" },
  { table: "support_messages", column: "sender_user_id" },
  { table: "member_admin_note_threads", column: "member_user_id" },
  { table: "sanctions", column: "user_id" },
  // 주소·라이더
  { table: "user_addresses", column: "user_id" },
  { table: "delivery_riders", column: "user_id" },
];

export type EmptyAccountCheck =
  | { ok: true; empty: true }
  | { ok: true; empty: false; reasons: string[] }
  | { ok: false; error: string };

export async function checkEmptyAccountForDiscard(
  sb: SupabaseClient,
  userId: string,
  attemptedPhone: string,
  nowMs = Date.now(),
): Promise<EmptyAccountCheck> {
  const uid = String(userId ?? "").trim();
  if (!uid) return { ok: false, error: "invalid_user_id" };

  const [profileRes, adminRes] = await Promise.all([
    sb
      .from("profiles")
      .select("id,created_at,role,provider,auth_provider,email,phone_verified,phone_verified_at,phone_verification_method,phone")
      .eq("id", uid)
      .maybeSingle(),
    sb.from("admin_memberships").select("role").eq("user_id", uid).limit(1),
  ]);
  if (profileRes.error || adminRes.error) return { ok: false, error: "lookup_failed" };
  if (!profileRes.data) return { ok: false, error: "not_found" };

  const reasons: string[] = [];
  const row = profileRes.data as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" ? v : null);

  let duplicate: Awaited<ReturnType<typeof findPhoneDuplicateOnOtherProfile>> = null;
  try {
    duplicate = String(attemptedPhone ?? "").trim()
      ? await findPhoneDuplicateOnOtherProfile(sb, uid, attemptedPhone)
      : null;
  } catch {
    return { ok: false, error: "lookup_failed" };
  }
  if (!duplicate) reasons.push("no_duplicate_phone");

  const createdAt = Date.parse(s(row.created_at) ?? "");
  if (!Number.isFinite(createdAt) || nowMs - createdAt > EMPTY_ACCOUNT_MAX_AGE_MS) reasons.push("not_recent");

  if (Array.isArray(adminRes.data) && adminRes.data.length > 0) reasons.push("admin");
  if (s(row.provider) === "admin_manual" || s(row.auth_provider) === "admin_manual") reasons.push("admin_manual");
  if (
    hasVerifiedPhone({
      phone_verified: row.phone_verified === true,
      phone_verified_at: s(row.phone_verified_at),
      phone_verification_method: s(row.phone_verification_method),
      role: s(row.role),
      provider: s(row.provider),
      auth_provider: s(row.auth_provider),
      email: s(row.email),
      phone: s(row.phone),
    })
  ) {
    reasons.push("phone_verified");
  }

  const counts = await Promise.all(
    EMPTY_ACCOUNT_ACTIVITY_CHECKS.map(async (c) => {
      const { count, error } = await sb.from(c.table).select("*", { count: "exact", head: true }).eq(c.column, uid);
      if (error) return { c, failed: true, n: 0 };
      return { c, failed: false, n: count ?? 0 };
    }),
  );
  if (counts.some((r) => r.failed)) return { ok: false, error: "lookup_failed" };
  for (const r of counts) if (r.n > 0) reasons.push(`${r.c.table}.${r.c.column}`);

  const blockers = await fetchAuthUserPurgeBlockers(sb, uid);
  if (!blockers.ok) reasons.push(...(blockers.blockers.length ? blockers.blockers : ["purge_blocked"]));

  return reasons.length === 0 ? { ok: true, empty: true } : { ok: true, empty: false, reasons };
}
