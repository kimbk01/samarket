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

  // 1회 보장 기록을 한 번에 (회원마다 왕복 금지 — 감사 P9). 새로 기록된 회원에게만 보낸다.
  const { data: recorded, error: recErr } = await sb.rpc("cm_contacts_record_join_notices", { p_joined: joinedUserId, p_owner_ids: owners });
  if (recErr) {
    console.error("[contacts] join notice record", recErr.message);
    return { sent: 0, skipped: "record_failed" };
  }
  const targets = (Array.isArray(recorded) ? recorded : []).map(String);

  // 알림은 회원별 언어·푸시라 회원마다 보낸다 — 10명씩 동시에. 실패하면 1번 다시, 그래도 실패면 기록을 지워 「보냄」으로 남기지 않는다.
  let sent = 0;
  const sendOne = async (ownerId: string) => {
    const language = await loadNotificationUserLanguage(sb, ownerId);
    const name = rawName || notifySafeT(language, "notify_member_fallback_name");
    const payload = {
      user_id: ownerId,
      notification_type: "status" as const,
      push_kind: "community" as const,
      title: notifySafeT(language, "notify_contact_joined_title", { vars: { name } }),
      body: notifySafeT(language, "notify_contact_joined_body", { vars: { name } }),
      link_url: MESSENGER_CONTACTS_SCREEN_HREF,
      ref_id: joinedUserId,
      sender_id: joinedUserId,
      dedupe_key: `cm_contact_joined:${ownerId}:${joinedUserId}`,
      meta: { kind: "contact_joined", actor_id: joinedUserId },
    };
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const ok = await appendUserNotification(sb, payload).catch((e: unknown) => {
        console.error("[contacts] join notice append", e);
        return false;
      });
      if (ok) {
        sent += 1;
        return;
      }
      if (attempt === 1) {
        await sb.from("contact_join_notices").delete().eq("owner_user_id", ownerId).eq("joined_user_id", joinedUserId);
      }
    }
  };
  for (let k = 0; k < targets.length; k += 10) {
    await Promise.all(targets.slice(k, k + 10).map(sendOne));
  }
  return { sent, skipped: null };
}
