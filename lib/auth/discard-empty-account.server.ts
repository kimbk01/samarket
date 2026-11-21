/**
 * 실수로 만든 빈 계정 정리 (설계 `docs/audit/registration-action-cta-ssot-design-2026-11-21.md` §5-6 ·
 * `docs/audit/auth-entry-phone-address-consent-design-2026-11-20.md` §8-1).
 *
 * 장면: 카카오로 가입한 사람이 구글·애플로 로그인해 새 계정이 생김 → 전화 단계에서 「이 번호로 가입된 계정이 있어요」.
 * 그 로그인 방법이 새 계정에 묶여 원래 계정에 연결할 수 없다(탈퇴로도 안 풀림). 빈 계정이면 회원이 스스로 지우고
 * 원래 계정에서 「연결된 로그인 관리」로 붙인다.
 *
 * 빈 계정 = 아래가 **모두** 맞을 때만 (하나라도 아니면 지우지 않고 고객센터 안내):
 * - 특권 관리자·관리자 멤버십 없음, 관리자 생성 계정 아님
 * - 전화 인증 안 됨 (인증된 계정은 이미 회원 — 이 기능 대상 아님)
 * - 활동 0: 거래 글·필라이프 글·댓글·거래 채팅방·채팅 메시지·메신저 방 참여·메신저 메시지·친구 관계(대기 포함)·
 *   주문·모임·포인트·신고·찜 (운영 열 이름 2026-11-21 확인)
 * - 영구 삭제를 막는 연결(`admin_can_purge_auth_user`) 없음
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { hasVerifiedPhone } from "@/lib/auth/post-login-profile-policy";
import { fetchAuthUserPurgeBlockers } from "@/lib/admin/admin-user-deletion";

type CountCheck = { table: string; column: string; reason: string };

/** 활동 표 — 하나라도 행이 있으면 빈 계정이 아니다 */
export const EMPTY_ACCOUNT_ACTIVITY_CHECKS: readonly CountCheck[] = [
  { table: "posts", column: "user_id", reason: "trade_posts" },
  { table: "community_posts", column: "user_id", reason: "community_posts" },
  { table: "community_comments", column: "user_id", reason: "community_comments" },
  { table: "product_chats", column: "buyer_id", reason: "trade_chats" },
  { table: "product_chats", column: "seller_id", reason: "trade_chats" },
  { table: "chat_rooms", column: "buyer_id", reason: "chat_rooms" },
  { table: "chat_rooms", column: "seller_id", reason: "chat_rooms" },
  { table: "chat_messages", column: "sender_id", reason: "chat_messages" },
  { table: "community_messenger_participants", column: "user_id", reason: "messenger_rooms" },
  { table: "community_messenger_messages", column: "sender_id", reason: "messenger_messages" },
  { table: "community_messenger_friendships", column: "requester_user_id", reason: "friends" },
  { table: "community_messenger_friendships", column: "addressee_user_id", reason: "friends" },
  { table: "store_orders", column: "buyer_user_id", reason: "orders" },
  { table: "moim_members", column: "user_id", reason: "moim" },
  { table: "point_ledger", column: "user_id", reason: "points" },
  { table: "reports", column: "reporter_id", reason: "reports" },
  { table: "favorites", column: "user_id", reason: "favorites" },
];

export type EmptyAccountCheck =
  | { ok: true; empty: true }
  | { ok: true; empty: false; reasons: string[] }
  | { ok: false; error: string };

export async function checkEmptyAccountForDiscard(sb: SupabaseClient, userId: string): Promise<EmptyAccountCheck> {
  const uid = String(userId ?? "").trim();
  if (!uid) return { ok: false, error: "invalid_user_id" };

  const [profileRes, adminRes] = await Promise.all([
    sb
      .from("profiles")
      .select("id,role,provider,auth_provider,email,phone_verified,phone_verified_at,phone_verification_method")
      .eq("id", uid)
      .maybeSingle(),
    sb.from("admin_memberships").select("role").eq("user_id", uid).limit(1),
  ]);
  if (profileRes.error || adminRes.error) return { ok: false, error: "lookup_failed" };
  if (!profileRes.data) return { ok: false, error: "not_found" };

  const reasons: string[] = [];
  const row = profileRes.data as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" ? v : null);
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
  for (const r of counts) if (r.n > 0 && !reasons.includes(r.c.reason)) reasons.push(r.c.reason);

  const blockers = await fetchAuthUserPurgeBlockers(sb, uid);
  if (!blockers.ok) reasons.push(...(blockers.blockers.length ? blockers.blockers : ["purge_blocked"]));

  return reasons.length === 0 ? { ok: true, empty: true } : { ok: true, empty: false, reasons };
}
