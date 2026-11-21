import type { SupabaseClient } from "@supabase/supabase-js";
import { isActiveSocialBlockRow } from "@/lib/social/block-ssot-types";
import {
  resolveNotificationLanguage,
} from "@/lib/notifications/notification-user-language";
import { parseExplicitAppLanguage, type AppLanguageCode } from "@/lib/i18n/config";

/**
 * 2026-11-21 보내기 1단계 (Owner 「1단계 승인」) — 알림 파이프라인의 받는 사람별 판정 읽기를 **받는 사람 전체 1번씩**으로.
 * 설계: docs/audit/supabase-request-surge-2026-11-18/message-send-fanout-design-2026-11-21.md §4 단계 1 ④
 *
 * 지금(받는 사람마다): 차단 관계 1 · 음소거 참가자 1 · 언어(user_settings 1 + user_devices 1) = 받는 사람당 최대 4번.
 * 이 함수: 차단 1 · 음소거 1 · 언어 2 = 받는 사람 수와 무관하게 최대 4번.
 * 판정 규칙은 기존 함수와 같다:
 *   - 차단: `isNotificationBlockedForRecipient` → `fetchBlockedPairFromSb` 의 양방향 `relation_type=blocked` 활성 행
 *   - 음소거: `isRoomMutedForUser` — (room_id, user_id) 행의 `is_muted === true` (행이 둘 이상이면 maybeSingle 오류 → false)
 *   - 언어: `loadNotificationUserLanguage` — 계정 명시값 → 최근 활성 기기 앱 언어(last_seen_at 내림차순 첫 행) → en
 * 하나라도 읽기 오류면 null → 호출부가 기존 받는 사람별 경로로 처리한다.
 */
export type NotifyRecipientFacts = {
  blocked: Set<string>;
  muted: Set<string>;
  language: Map<string, AppLanguageCode>;
};

const trim = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export async function loadNotifyRecipientFactsBatch(
  sb: SupabaseClient<any>,
  input: {
    roomId: string;
    senderUserId: string;
    recipientUserIds: string[];
    /** 차단을 이미 확인한 받는 사람(보내기 게이트의 1:1 상대) — 차단 조회에서 뺀다 */
    blockClearedUserId?: string | null;
  }
): Promise<NotifyRecipientFacts | null> {
  const roomId = trim(input.roomId);
  const sender = trim(input.senderUserId);
  const ids = [...new Set(input.recipientUserIds.map(trim).filter((id) => id && id !== sender))];
  if (!roomId || !sender || ids.length === 0) {
    return { blocked: new Set(), muted: new Set(), language: new Map() };
  }
  const cleared = trim(input.blockClearedUserId);
  const blockIds = ids.filter((id) => id !== cleared);

  try {
    const [blockRes, muteRes, settingsRes, devicesRes] = await Promise.all([
      blockIds.length
        ? sb
            .from("user_social_relations")
            .select("owner_user_id, target_user_id, is_active, relation_type")
            .eq("relation_type", "blocked")
            .or(
              `and(owner_user_id.eq.${sender},target_user_id.in.(${blockIds.join(",")})),` +
                `and(target_user_id.eq.${sender},owner_user_id.in.(${blockIds.join(",")}))`
            )
        : Promise.resolve({ data: [], error: null }),
      sb.from("community_messenger_participants").select("user_id, is_muted").eq("room_id", roomId).in("user_id", ids),
      sb.from("user_settings").select("user_id, preferred_language").in("user_id", ids),
      sb
        .from("user_devices")
        .select("user_id, app_language, last_seen_at")
        .in("user_id", ids)
        .eq("is_active", true)
        .not("app_language", "is", null)
        .order("last_seen_at", { ascending: false, nullsFirst: false }),
    ]);
    if (blockRes.error || muteRes.error || settingsRes.error || devicesRes.error) return null;

    const blocked = new Set<string>();
    const blockSet = new Set(blockIds);
    for (const row of (blockRes.data ?? []) as Array<{
      owner_user_id?: string;
      target_user_id?: string;
      is_active?: boolean | null;
      relation_type?: string;
    }>) {
      if (!isActiveSocialBlockRow(row as { relation_type: string; is_active: boolean | null })) continue;
      const owner = trim(row.owner_user_id);
      const target = trim(row.target_user_id);
      const other = owner === sender ? target : target === sender ? owner : "";
      if (other && blockSet.has(other)) blocked.add(other);
    }

    const muteRows = new Map<string, Array<{ is_muted?: boolean | null }>>();
    for (const row of (muteRes.data ?? []) as Array<{ user_id?: string; is_muted?: boolean | null }>) {
      const uid = trim(row.user_id);
      if (!uid) continue;
      const list = muteRows.get(uid) ?? [];
      list.push(row);
      muteRows.set(uid, list);
    }
    const muted = new Set<string>();
    for (const [uid, rows] of muteRows) {
      if (rows.length === 1 && rows[0]!.is_muted === true) muted.add(uid);
    }

    const account = new Map<string, unknown>();
    for (const row of (settingsRes.data ?? []) as Array<{ user_id?: string; preferred_language?: unknown }>) {
      const uid = trim(row.user_id);
      if (uid && !account.has(uid)) account.set(uid, row.preferred_language);
    }
    const device = new Map<string, unknown>();
    for (const row of (devicesRes.data ?? []) as Array<{ user_id?: string; app_language?: unknown }>) {
      const uid = trim(row.user_id);
      if (uid && !device.has(uid)) device.set(uid, row.app_language);
    }
    const language = new Map<string, AppLanguageCode>();
    for (const uid of ids) {
      language.set(
        uid,
        resolveNotificationLanguage(parseExplicitAppLanguage(account.get(uid)), parseExplicitAppLanguage(device.get(uid)))
      );
    }

    return { blocked, muted, language };
  } catch {
    return null;
  }
}
