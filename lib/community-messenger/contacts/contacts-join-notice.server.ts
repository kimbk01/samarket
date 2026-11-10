import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appendUserNotification } from "@/lib/notifications/append-user-notification";
import { loadNotificationUserLanguage } from "@/lib/notifications/notification-user-language";
import { notifySafeT } from "@/lib/notifications/notify-safe-translate";
import { MESSENGER_CONTACTS_SCREEN_HREF } from "@/lib/community-messenger/contacts/contacts-contract";
import type { ContactsAdminSettings } from "@/lib/community-messenger/contacts/contacts-service.server";

/**
 * 가입 안내 (SSOT v5 §4 S8 · 정책 #3·#4) — 새 회원이 처음 동의해 번호가 등록되면, 그 번호를 연락처에 가진 회원에게 1회.
 * - 대상 계산: `cm_contacts_match_new_member` (가입 알림 켬 · 차단·숨긴 추천 제외 · 이미 보냄 제외 · 상대 「번호로 찾기」=모두)
 * - 1회 보장: `contact_join_notices` 에 먼저 기록되는 회원에게만 보낸다 (재설치·번호 변경·재동의에도 재발송 없음)
 * - 경로: 기존 친구 알림과 같은 `appendUserNotification` (새 알림 종류 없음 · SSOT v5 G-2), 상한 = 어드민 `join_notice_cap`
 * - 어드민 「가입 안내 보내기」가 꺼져 있으면 아무것도 하지 않는다.
 */
export async function sendContactJoinNotices(
  sb: SupabaseClient,
  joinedUserId: string,
  admin: ContactsAdminSettings
): Promise<{ sent: number; skipped: string | null }> {
  if (!admin.joinNoticeEnabled) return { sent: 0, skipped: "join_notice_disabled" };
  const { data, error } = await sb.rpc("cm_contacts_match_new_member", { p_user: joinedUserId, p_limit: admin.joinNoticeCap });
  if (error) {
    console.error("[contacts] join notice match", error.message);
    return { sent: 0, skipped: "match_failed" };
  }
  const owners = (((data ?? {}) as { owner_ids?: unknown }).owner_ids ?? []) as string[];
  if (!Array.isArray(owners) || owners.length === 0) return { sent: 0, skipped: null };

  const { data: prof } = await sb.from("profiles").select("nickname, dibay_id").eq("id", joinedUserId).maybeSingle();
  const p = (prof ?? {}) as { nickname?: string | null; dibay_id?: string | null };
  const rawName = String(p.nickname ?? "").trim();

  let sent = 0;
  for (const ownerId of owners) {
    // 먼저 기록 — 이미 있으면(다른 요청이 먼저 보냄) 건너뜀
    const { data: inserted, error: insErr } = await sb
      .from("contact_join_notices")
      .upsert({ owner_user_id: ownerId, joined_user_id: joinedUserId }, { onConflict: "owner_user_id,joined_user_id", ignoreDuplicates: true })
      .select("owner_user_id");
    if (insErr || !Array.isArray(inserted) || inserted.length === 0) continue;
    const language = await loadNotificationUserLanguage(sb, ownerId);
    const name = rawName || notifySafeT(language, "notify_member_fallback_name");
    await appendUserNotification(sb, {
      user_id: ownerId,
      notification_type: "status",
      push_kind: "community",
      title: notifySafeT(language, "notify_contact_joined_title", { vars: { name } }),
      body: notifySafeT(language, "notify_contact_joined_body", { vars: { name } }),
      link_url: MESSENGER_CONTACTS_SCREEN_HREF,
      ref_id: joinedUserId,
      sender_id: joinedUserId,
      dedupe_key: `cm_contact_joined:${ownerId}:${joinedUserId}`,
      meta: { kind: "contact_joined", actor_id: joinedUserId },
    }).catch((e: unknown) => console.error("[contacts] join notice append", e));
    sent += 1;
  }
  return { sent, skipped: null };
}
