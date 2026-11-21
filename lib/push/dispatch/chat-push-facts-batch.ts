import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationEventRow } from "@/lib/notifications/core/notification-event-schema";
import { getNotificationEventDefinition } from "@/lib/notifications/core/notification-event-registry";
import { isActiveSocialBlockRow } from "@/lib/social/block-ssot-types";
import {
  evaluateNotificationDeliverySafety,
  isExpired,
  type NotificationDeliverySafetyDecision,
} from "@/lib/push/dispatch/notification-delivery-safety-gate";
import {
  ADMIN_OPS_PREFERENCE_SELECT,
  LEGACY_USER_SETTINGS_PUSH_SELECT,
  NOTIFICATION_SETTINGS_SELECT,
  OWNER_SETTINGS_SELECT,
} from "@/lib/notifications/policy/notification-preference-storage-reader.server";
import { isMissingPreferenceRelationError } from "@/lib/notifications/policy/notification-preference-relation-errors";
import { normalizeNotificationPreferenceStorage } from "@/lib/notifications/policy/notification-preference-storage-normalizer";
import type { PreloadedNotificationPreferences } from "@/lib/notifications/web-push-user-settings-gate";
import {
  filterUserDevicePushTargets,
  type UserDevicePushRow,
} from "@/lib/push/dispatch/filter-user-device-push-targets";
import {
  USER_DEVICE_TARGET_SELECT_COLUMNS,
  WEB_PUSH_TARGET_SELECT_COLUMNS,
  webPushRowsToTargets,
  type WebPushRow,
} from "@/lib/push/dispatch/load-active-push-targets";
import { resolvePushEnvironment, type PushEnvironment } from "@/lib/push/push-environment";
import type { PreloadedChatPushFacts, PushTarget } from "@/lib/push/dispatch/push-payload-types";

/**
 * 2026-11-21 메시지 보내기 3단계 — 채팅 푸시 발송 전 사실을 **받는 사람 전원 한 번에** 읽는다.
 * 설계·통화 영향 분석: docs/audit/supabase-request-surge-2026-11-18/message-send-fanout-stage3-push-design-2026-11-21.md
 *
 * 받는 사람마다(지금): 알림 행 다시 읽기 1 · 안전 확인 3~4 · 설정 4 · 대상 2 = 10~11번.
 * 이 함수: 알림 행 1 · 차단 1 · 방 1 · 참가 1 · (그룹) 강퇴 1 · 설정 4 · 기기 1 · 웹푸시 1 = 받는 사람 수와 무관.
 * 판정은 기존 함수와 같다 — `dispatch-push-for-user.ts`(행 없음 → 건너뜀) · `evaluateNotificationDeliverySafety`
 * (만료 → 차단 → 방 삭제 → 참가 → 강퇴 순서·오류 처리) · `readNormalizedNotificationPreferenceSnapshot`
 * (행 2개 이상·읽기 오류 = 설정 읽기 실패 · 표 없음 = 행 없음) · `loadActivePushTargets`(같은 필터·정렬 → 사람별 `filterUserDevicePushTargets`).
 * 채팅 방이 아닌 알림(거래·주문 등)은 안전 확인만 기존 함수로 한 건씩.
 * 읽기 오류로 판정할 수 없으면 null → 호출부가 기존 경로(한 명씩)로 보낸다.
 */
const trim = (v: unknown) => (typeof v === "string" ? v.trim() : "");

type Res<T> = { data: T[] | null; error: { code?: string; message?: string } | null };

function groupBy<T>(rows: readonly T[], key: (r: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    if (!k) continue;
    const list = m.get(k) ?? [];
    list.push(r);
    m.set(k, list);
  }
  return m;
}

async function loadSafetyBatch(
  svc: SupabaseClient<any>,
  rows: readonly NotificationEventRow[],
  nowMs: number
): Promise<Map<string, NotificationDeliverySafetyDecision> | null> {
  const out = new Map<string, NotificationDeliverySafetyDecision>();
  const messengerRows: NotificationEventRow[] = [];
  for (const row of rows) {
    const domain = getNotificationEventDefinition(row.type).domain;
    if (domain === "general_direct" || domain === "group") messengerRows.push(row);
    else out.set(row.id, await evaluateNotificationDeliverySafety(svc, row, nowMs));
  }
  if (!messengerRows.length) return out;

  // 차단: 보낸 사람(actor)별로 받는 사람 전원 1번 — 기존 fetchBlockedPairFromSb 와 같은 행 조건(오류는 기존처럼 「차단 아님」)
  const blocked = new Set<string>();
  for (const [actor, list] of groupBy(messengerRows, (r) => trim(r.actor_user_id))) {
    const ids = [...new Set(list.map((r) => r.user_id).filter((u) => u && u !== actor))];
    if (!ids.length) continue;
    const { data } = (await svc
      .from("user_social_relations")
      .select("owner_user_id, target_user_id, is_active, relation_type")
      .eq("relation_type", "blocked")
      .or(
        `and(owner_user_id.eq.${actor},target_user_id.in.(${ids.join(",")})),` +
          `and(target_user_id.eq.${actor},owner_user_id.in.(${ids.join(",")}))`
      )) as Res<{ owner_user_id?: string; target_user_id?: string; is_active?: boolean | null; relation_type?: string }>;
    for (const r of data ?? []) {
      if (!isActiveSocialBlockRow(r as { relation_type: string; is_active: boolean | null })) continue;
      const owner = trim(r.owner_user_id);
      const target = trim(r.target_user_id);
      const other = owner === actor ? target : target === actor ? owner : "";
      if (other) blocked.add(`${actor}|${other}`);
    }
  }

  for (const [roomId, list] of groupBy(messengerRows, (r) => trim(r.room_id))) {
    const { data: room, error: roomError } = await svc
      .from("community_messenger_rooms")
      .select("id, room_type, room_status, deleted_at")
      .eq("id", roomId)
      .maybeSingle();
    const userIds = [...new Set(list.map((r) => r.user_id))];
    const roomType = trim((room as { room_type?: unknown } | null)?.room_type);
    const roomGone =
      !roomError &&
      room &&
      (trim((room as { deleted_at?: unknown }).deleted_at) ||
        (trim((room as { room_status?: unknown }).room_status) &&
          trim((room as { room_status?: unknown }).room_status) !== "active"));
    const roomUsable = !roomError && room && !roomGone;
    const needBans = roomUsable && list.some((r) => getNotificationEventDefinition(r.type).domain === "group" || roomType === "private_group");
    const [partRes, banRes] = roomUsable
      ? await Promise.all([
          svc
            .from("community_messenger_participants")
            .select("user_id, left_at")
            .eq("room_id", roomId)
            .in("user_id", userIds) as unknown as Promise<Res<{ user_id?: string; left_at?: unknown }>>,
          needBans
            ? (svc
                .from("community_messenger_group_bans")
                .select("id, user_id")
                .eq("room_id", roomId)
                .in("user_id", userIds)
                .is("unbanned_at", null) as unknown as Promise<Res<{ id?: string; user_id?: string }>>)
            : Promise.resolve({ data: [], error: null } as Res<{ id?: string; user_id?: string }>),
        ])
      : [null, null];
    const partsByUser = groupBy(partRes?.data ?? [], (r) => trim(r.user_id));
    const bansByUser = groupBy(banRes?.data ?? [], (r) => trim(r.user_id));

    for (const row of list) {
      const definition = getNotificationEventDefinition(row.type);
      let decision: NotificationDeliverySafetyDecision;
      if (isExpired(row, nowMs)) decision = { allow: false, reason: "event_expired" };
      else if (trim(row.actor_user_id) && blocked.has(`${trim(row.actor_user_id)}|${row.user_id}`))
        decision = { allow: false, reason: "blocked" };
      else if (roomError) {
        decision =
          (roomError as { code?: string }).code === "22P02"
            ? { allow: false, reason: "destination_deleted" }
            : { allow: false, reason: "safety_check_failed" };
      } else if (!room || roomGone) decision = { allow: false, reason: "destination_deleted" };
      else if (partRes?.error) decision = { allow: false, reason: "safety_check_failed" };
      else {
        const parts = partsByUser.get(row.user_id) ?? [];
        if (parts.length > 1) decision = { allow: false, reason: "safety_check_failed" };
        else if (!parts.length || trim(parts[0]!.left_at)) decision = { allow: false, reason: "group_membership_inactive" };
        else if (definition.domain === "group" || roomType === "private_group") {
          const bans = bansByUser.get(row.user_id) ?? [];
          if (banRes?.error || bans.length > 1) decision = { allow: false, reason: "safety_check_failed" };
          else if (bans.length === 1) decision = { allow: false, reason: "group_banned" };
          else decision = { allow: true };
        } else decision = { allow: true };
      }
      out.set(row.id, decision);
    }
  }
  // room_id 없는 채팅 행 — 기존과 같이 destination_forbidden(만료·차단이 먼저)
  for (const row of messengerRows) {
    if (out.has(row.id)) continue;
    if (isExpired(row, nowMs)) out.set(row.id, { allow: false, reason: "event_expired" });
    else if (trim(row.actor_user_id) && blocked.has(`${trim(row.actor_user_id)}|${row.user_id}`))
      out.set(row.id, { allow: false, reason: "blocked" });
    else out.set(row.id, { allow: false, reason: "destination_forbidden" });
  }
  return out;
}

async function loadPreferencesBatch(
  svc: SupabaseClient<any>,
  userIds: readonly string[],
  now: Date
): Promise<Map<string, PreloadedNotificationPreferences>> {
  const read = async (table: string, select: string) => {
    const { data, error } = (await svc.from(table).select(`user_id, ${select}`).in("user_id", [...userIds])) as Res<
      Record<string, unknown>
    >;
    if (error) {
      if (isMissingPreferenceRelationError(error)) return { rows: new Map<string, Record<string, unknown>[]>(), failed: false };
      return { rows: new Map<string, Record<string, unknown>[]>(), failed: true };
    }
    return { rows: groupBy(data ?? [], (r) => trim(r.user_id)), failed: false };
  };
  const [ns, legacy, owner, admin] = await Promise.all([
    read("user_notification_settings", NOTIFICATION_SETTINGS_SELECT),
    read("user_settings", LEGACY_USER_SETTINGS_PUSH_SELECT),
    read("owner_notification_settings", OWNER_SETTINGS_SELECT),
    read("admin_notification_preferences", ADMIN_OPS_PREFERENCE_SELECT),
  ]);
  const out = new Map<string, PreloadedNotificationPreferences>();
  for (const uid of userIds) {
    const pick = (t: { rows: Map<string, Record<string, unknown>[]>; failed: boolean }) => {
      if (t.failed) return { failed: true as const };
      const list = t.rows.get(uid) ?? [];
      if (list.length > 1) return { failed: true as const };
      return { row: list[0] ?? null };
    };
    const parts = [pick(ns), pick(legacy), pick(owner), pick(admin)];
    if (parts.some((p) => "failed" in p)) {
      out.set(uid, { readFailed: true });
      continue;
    }
    const strip = (r: Record<string, unknown> | null) => {
      if (!r) return null;
      const { user_id: _u, ...rest } = r;
      return rest;
    };
    const [a, b, c, d] = parts.map((p) => strip((p as { row: Record<string, unknown> | null }).row));
    out.set(uid, {
      snapshot: normalizeNotificationPreferenceStorage({
        notificationSettingsRow: a as never,
        legacyUserSettingsRow: b as never,
        ownerSettingsRow: c as never,
        adminOpsPreferenceRow: d as never,
        now,
      }),
    });
  }
  return out;
}

async function loadTargetsBatch(
  svc: SupabaseClient<any>,
  userIds: readonly string[],
  environment: PushEnvironment
): Promise<Map<string, PushTarget[]>> {
  const selectDevices = (columns: string) =>
    svc
      .from("user_devices")
      .select(`user_id, ${columns}`)
      .in("user_id", [...userIds])
      .eq("is_active", true)
      .eq("environment", environment)
      .order("last_seen_at", { ascending: false })
      .order("updated_at", { ascending: false });
  let { data: deviceRows, error: deviceErr } = (await selectDevices(
    `${USER_DEVICE_TARGET_SELECT_COLUMNS}, apns_environment`
  )) as Res<Record<string, unknown>>;
  if (deviceErr && /apns_environment/i.test(deviceErr.message ?? "")) {
    ({ data: deviceRows, error: deviceErr } = (await selectDevices(USER_DEVICE_TARGET_SELECT_COLUMNS)) as Res<
      Record<string, unknown>
    >);
  }
  const devicesByUser = deviceErr ? new Map<string, Record<string, unknown>[]>() : groupBy(deviceRows ?? [], (r) => trim(r.user_id));

  const { data: webRows, error: webErr } =
    environment === "production"
      ? ((await svc.from("web_push_subscriptions").select(`user_id, ${WEB_PUSH_TARGET_SELECT_COLUMNS}`).in("user_id", [...userIds])) as Res<
          Record<string, unknown>
        >)
      : { data: [] as Record<string, unknown>[], error: null };
  const webByUser = webErr ? new Map<string, Record<string, unknown>[]>() : groupBy(webRows ?? [], (r) => trim(r.user_id));

  const out = new Map<string, PushTarget[]>();
  for (const uid of userIds) {
    const targets: PushTarget[] = [];
    const devices = devicesByUser.get(uid) ?? [];
    if (devices.length) {
      targets.push(...filterUserDevicePushTargets(devices as unknown as UserDevicePushRow[], { fcmMode: "multi_device_fcm" }));
    }
    const web = webByUser.get(uid) ?? [];
    if (web.length) targets.push(...webPushRowsToTargets(web as unknown as WebPushRow[], environment));
    out.set(uid, targets);
  }
  return out;
}

export async function loadChatPushFactsBatch(
  svc: SupabaseClient<any>,
  rows: readonly NotificationEventRow[],
  opts?: { nowMs?: number; environment?: PushEnvironment }
): Promise<Map<string, PreloadedChatPushFacts> | null> {
  if (!rows.length) return new Map();
  const nowMs = opts?.nowMs ?? Date.now();
  const environment = opts?.environment ?? resolvePushEnvironment();
  try {
    const ids = [...new Set(rows.map((r) => r.id))];
    const { data: eventRows, error: eventErr } = (await svc
      .from("notification_events")
      .select("*")
      .in("id", ids)) as Res<NotificationEventRow>;
    if (eventErr) return null;
    const byId = new Map((eventRows ?? []).map((r) => [r.id, r] as const));
    const present: NotificationEventRow[] = [];
    for (const row of rows) {
      const live = byId.get(row.id);
      if (live && live.user_id === row.user_id) present.push(live);
    }
    const userIds = [...new Set(present.map((r) => r.user_id))];
    const [safety, prefs, targets] = await Promise.all([
      loadSafetyBatch(svc, present, nowMs),
      loadPreferencesBatch(svc, userIds, new Date(nowMs)),
      loadTargetsBatch(svc, userIds, environment),
    ]);
    if (!safety) return null;
    const out = new Map<string, PreloadedChatPushFacts>();
    for (const row of rows) {
      const live = byId.get(row.id);
      if (!live || live.user_id !== row.user_id) {
        out.set(row.id, { eventRow: null, safety: { allow: true }, preferences: { readFailed: true }, targets: [] });
        continue;
      }
      out.set(row.id, {
        eventRow: live,
        safety: safety.get(row.id) ?? { allow: false, reason: "safety_check_failed" },
        preferences: prefs.get(row.user_id) ?? { readFailed: true },
        targets: targets.get(row.user_id) ?? [],
      });
    }
    return out;
  } catch {
    return null;
  }
}
